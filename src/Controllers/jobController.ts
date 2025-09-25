import { Response } from 'express'; // นำเข้า Response สำหรับตอบกลับ API
import { AuthRequest } from '@/types'; // นำเข้า type ของ request ที่มี user
import Job from '../Models/Job'; // นำเข้าโมเดล Job สำหรับจัดการงาน
import { JobDocument } from '../Models/Job'; // นำเข้า type JobDocument สำหรับใช้งานกับ instance ของ Job
import User from '../Models/User'; // นำเข้าโมเดล User สำหรับจัดการผู้ใช้
import Milestone from '../Models/Milestone'; // นำเข้าโมเดล Milestone สำหรับจัดการ milestone
import Notification from '../Models/Nontification'; // นำเข้าโมเดล Notification สำหรับแจ้งเตือน
import { responseHelper } from '@/utils/responseHelper'; // นำเข้า helper สำหรับตอบกลับ API
import { catchAsync } from '../Middleware/errorHandler'; // นำเข้า middleware สำหรับจัดการ error ใน async function
import { SUCCESS_MESSAGES, ERROR_MESSAGES, JOB_CATEGORIES } from '@/utils/constants'; // นำเข้าข้อความคงที่
import { SocketService } from '@/config/socket'; // นำเข้า service สำหรับ socket เพื่อแจ้งเตือนแบบ real-time
import { Document, Model, Types } from 'mongoose'; // นำเข้า type ของ mongoose

export class JobController {
  private socketService = SocketService.getInstance(); // สร้าง instance ของ socketService สำหรับส่ง notification

  /**
   * ดึงงานทั้งหมด พร้อม filter และ pagination
   */
  getAllJobs = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    // รับค่าจาก query string สำหรับ filter และ pagination
    const {
      page = 1, // หน้าเริ่มต้น
      limit = 10, // จำนวนงานต่อหน้า
      search, // คำค้นหา
      category, // หมวดหมู่งาน
      type, // ประเภทงาน
      minBudget, // งบขั้นต่ำ
      maxBudget, // งบสูงสุด
      status = 'active', // สถานะงาน
      sort = '-createdAt' // การเรียงลำดับ
    } = req.query;

    // สร้าง options สำหรับ filter
    const options = {
      page: Number(page),
      limit: Number(limit),
      sort,
      search,
      category,
      type,
      minBudget: minBudget ? Number(minBudget) : undefined,
      maxBudget: maxBudget ? Number(maxBudget) : undefined,
      status
    };

    // เรียกใช้ method findWithFilters ในโมเดล Job เพื่อค้นหางานตาม filter
    const jobs = await (Job as any).findWithFilters({}, options);
    // นับจำนวนงานทั้งหมดที่มีสถานะ active
    const total = await Job.countDocuments({ status: 'active' });

    // ตอบกลับข้อมูลงานแบบ paginated
    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      jobs,
      Number(page),
      Number(limit),
      total
    );
  });

  /**
   * ดึงงานตาม ID
   */
  getJobById = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id งานจาก params

    // ค้นหางานตาม id และ populate ข้อมูล employer, worker, milestones
    const job = await Job.findById(id)
      .populate('employerId', 'name email profilePic')
      .populate('workerId', 'name email profilePic')
      .populate('milestones');

    // ถ้าไม่เจองาน ตอบกลับว่าไม่พบ
    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตอบกลับข้อมูลงาน
    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, job);
  });

  /**
   * สร้างงานใหม่
   */
  createJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const employerId = req.user!._id; // รับ id ของผู้สร้างงานจาก user
    // รับข้อมูลงานจาก body
    const {
      title,
      description,
      type,
      category,
      budget,
      duration,
      deadline,
      requirements,
      attachments
    } = req.body;

    // สร้าง instance งานใหม่
    const job = new Job({
      title,
      description,
      type,
      category,
      budget,
      duration,
      deadline,
      employerId,
      requirements,
      attachments,
      status: 'active'
    });

    // บันทึกงานลงฐานข้อมูล
    await job.save();

    // ค้นหาผู้ใช้ที่เกี่ยวข้องกับงานนี้ (worker ที่มี category หรือ skill ตรงกับงาน)
    const relevantWorkers = await User.find({
      role: 'worker',
      $or: [
        { categories: { $in: [category] } },
        { skills: { $regex: new RegExp(title.split(' ').join('|'), 'i') } }
      ],
      isActive: true
    }).limit(50);

    // ส่ง notification ไปยัง worker ที่เกี่ยวข้อง
    for (const worker of relevantWorkers) {
      await (Notification as any).createJobNotification(
        worker._id,
        job._id,
        'New Job Available',
        `A new ${type} job "${title}" in ${category} is available`,
        `/jobs/${job._id}`
      );

      // ส่ง notification แบบ real-time ผ่าน socket
      this.socketService.sendNotificationToUser(worker._id.toString(), {
        type: 'job',
        title: 'New Job Available',
        message: `${title} - ${category}`,
        data: { jobId: job._id }
      });
    }

    // ตอบกลับว่าสร้างงานสำเร็จ
    responseHelper.created(res, SUCCESS_MESSAGES.JOB_CREATED, job);
  });

  /**
   * อัพเดทงาน
   */
  updateJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id งานจาก params
    const employerId = req.user!._id; // รับ id ผู้สร้างงาน
    const updates = req.body; // รับข้อมูลที่ต้องการอัพเดท

    // ค้นหางานที่ต้องการอัพเดท
    const job = await Job.findOne({ _id: id, employerId }) as JobDocument | null;

    // ถ้าไม่เจองาน ตอบกลับว่าไม่พบ
    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ถ้างานไม่สามารถแก้ไขได้ ตอบกลับ error
    if (!job.isEditable()) {
      responseHelper.error(res, ERROR_MESSAGES.JOB_NOT_EDITABLE, 400);
      return;
    }

    // อัพเดทข้อมูลงาน
    Object.assign(job, updates);
    await job.save();

    // แจ้งเตือนผู้สมัครงานทุกคนว่ามีการอัพเดทงาน
    if (job.applicants.length > 0) {
      for (const applicantId of job.applicants) {
        await (Notification as any).createJobNotification(
          applicantId,
          job._id,
          'Job Updated',
          `The job "${job.title}" has been updated`,
          `/jobs/${job._id}`
        );
      }
    }

    // ตอบกลับว่างานถูกอัพเดทแล้ว
    responseHelper.success(res, SUCCESS_MESSAGES.JOB_UPDATED, job);
  });

  /**
   * ลบงาน
   */
  deleteJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id งานจาก params
    const employerId = req.user!._id; // รับ id ผู้สร้างงาน

    // ค้นหางานที่ต้องการลบ
    const job = await Job.findOne({ _id: id, employerId }) as JobDocument | null;

    // ถ้าไม่เจองาน ตอบกลับว่าไม่พบ
    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ถ้างานกำลังดำเนินการอยู่ ไม่สามารถลบได้
    if (job.status === 'in_progress') {
      responseHelper.error(res, 'Cannot delete job in progress', 400);
      return;
    }

    // แจ้งเตือนผู้สมัครงานทุกคนว่างานถูกยกเลิก
    for (const applicantId of job.applicants) {
      await (Notification as any).createJobNotification(
        applicantId,
        job._id,
        'Job Cancelled',
        `The job "${job.title}" has been cancelled`,
        null
      );
    }

    // ลบงานออกจากฐานข้อมูล
    await Job.findByIdAndDelete(id);

    // ตอบกลับว่างานถูกลบแล้ว
    responseHelper.success(res, SUCCESS_MESSAGES.JOB_DELETED);
  });

  /**
   * สมัครงาน
   */
  applyToJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id งานจาก params
    const workerId = req.user!._id; // รับ id ของผู้สมัครงาน

    // ค้นหางานที่ต้องการสมัคร
    const job = await Job.findById(id) as JobDocument | null;

    // ถ้าไม่เจองาน ตอบกลับว่าไม่พบ
    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบว่าผู้ใช้สามารถสมัครงานนี้ได้หรือไม่
    if (!job.canUserApply(workerId)) {
      responseHelper.error(res, 'Cannot apply to this job', 400);
      return;
    }

    // เพิ่มผู้สมัครลงใน applicants
    job.addApplicant(workerId);
    await job.save();

    // แจ้งเตือน employer ว่ามีคนสมัครงาน
    await (Notification as any).createJobNotification(
      job.employerId,
      job._id,
      'New Job Application',
      `Someone applied for "${job.title}"`,
      `/jobs/${job._id}/applications`
    );

    // ส่ง notification แบบ real-time ผ่าน socket
    this.socketService.sendNotificationToUser(job.employerId.toString(), {
      type: 'job',
      title: 'New Application',
      message: `New application for ${job.title}`,
      data: { jobId: job._id }
    });

    // ตอบกลับว่าสมัครงานสำเร็จ
    responseHelper.success(res, SUCCESS_MESSAGES.JOB_APPLICATION_SUBMITTED);
  });

  /**
   * ดึงข้อมูลผู้สมัครงาน
   */
  getJobApplications = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id งานจาก params
    const employerId = req.user!._id; // รับ id ผู้สร้างงาน

    // ค้นหางานและ populate ข้อมูลผู้สมัคร
    const job = await Job.findOne({ _id: id, employerId })
      .populate('applicants', 'name email profilePic skills categories') as JobDocument | null;

    // ถ้าไม่เจองาน ตอบกลับว่าไม่พบ
    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตอบกลับข้อมูลผู้สมัครงาน
    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, {
      job: {
        id: job._id,
        title: job.title,
        status: job.status
      },
      applications: job.applicants
    });
  });

  /**
   * มอบหมายงานให้ worker
   */
  assignJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id งานจาก params
    const { workerId } = req.body; // รับ id ของ worker ที่จะมอบหมายงาน
    const employerId = req.user!._id; // รับ id ผู้สร้างงาน

    // ค้นหางานที่ต้องการมอบหมาย
    const job = await Job.findOne({ _id: id, employerId }) as JobDocument | null;

    // ถ้าไม่เจองาน ตอบกลับว่าไม่พบ
    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบว่างานยัง active อยู่หรือไม่
    if (job.status !== 'active') {
      responseHelper.error(res, 'Job is not active', 400);
      return;
    }

    // ตรวจสอบว่า worker ได้สมัครงานนี้หรือไม่
    if (!job.applicants.includes(workerId)) {
      responseHelper.error(res, 'Worker has not applied to this job', 400);
      return;
    }

    // มอบหมายงานให้ worker
    await job.assignWorker(workerId);

    // แจ้งเตือน worker ที่ได้รับมอบหมายงาน
    await (Notification as any).createJobNotification(
      workerId,
      job._id,
      'Job Assigned',
      `You have been assigned to "${job.title}"`,
      `/jobs/${job._id}`
    );

    // แจ้งเตือนผู้สมัครคนอื่น ๆ ว่างานถูกมอบหมายแล้ว
    for (const applicantId of job.applicants) {
      if (applicantId.toString() !== workerId) {
        await (Notification as any).createJobNotification(
          applicantId,
          job._id,
          'Job Filled',
          `The job "${job.title}" has been assigned to another candidate`,
          null
        );
      }
    }

    // ส่ง notification แบบ real-time ผ่าน socket
    this.socketService.sendNotificationToUser(workerId, {
      type: 'job',
      title: 'Job Assigned',
      message: `You got the job: ${job.title}`,
      data: { jobId: job._id }
    });

    // ตอบกลับว่างานถูกมอบหมายแล้ว
    responseHelper.success(res, SUCCESS_MESSAGES.JOB_ASSIGNED);
  });

  /**
   * ทำงานให้เสร็จสิ้น
   */
  completeJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id งานจาก params
    const workerId = req.user!._id; // รับ id worker

    // ค้นหางานที่ต้องการทำให้เสร็จ
    const job = await Job.findOne({ _id: id, workerId }) as JobDocument | null;

    // ถ้าไม่เจองาน ตอบกลับว่าไม่พบ
    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบว่างานอยู่ในสถานะ in_progress หรือไม่
    if (job.status !== 'in_progress') {
      responseHelper.error(res, 'Job is not in progress', 400);
      return;
    }

    // ทำงานให้เสร็จสิ้น
    await job.completeJob();

    // แจ้งเตือน employer ว่างานเสร็จแล้ว
    await (Notification as any).createJobNotification(
      job.employerId,
      job._id,
      'Job Completed',
      `"${job.title}" has been marked as completed`,
      `/jobs/${job._id}`
    );

    // ส่ง notification แบบ real-time ผ่าน socket
    this.socketService.sendNotificationToUser(job.employerId.toString(), {
      type: 'job',
      title: 'Job Completed',
      message: `${job.title} is ready for review`,
      data: { jobId: job._id }
    });

    // ตอบกลับว่างานเสร็จสิ้นแล้ว
    responseHelper.success(res, SUCCESS_MESSAGES.JOB_COMPLETED);
  });

  /**
   * ยกเลิกงาน
   */
  cancelJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id งานจาก params
    const employerId = req.user!._id; // รับ id ผู้สร้างงาน

    // ค้นหางานที่ต้องการยกเลิก
    const job = await Job.findOne({ _id: id, employerId }) as JobDocument | null;

    // ถ้าไม่เจองาน ตอบกลับว่าไม่พบ
    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ยกเลิกงาน
    await job.cancelJob();

    // แจ้งเตือน worker ถ้ามีการมอบหมายงาน
    if (job.workerId) {
      await (Notification as any).createJobNotification(
        job.workerId,
        job._id,
        'Job Cancelled',
        `The job "${job.title}" has been cancelled`,
        null
      );
    }

    // ตอบกลับว่างานถูกยกเลิกแล้ว
    responseHelper.success(res, 'Job cancelled successfully');
  });

  /**
   * ดึง milestone ของงาน
   */
  getJobMilestones = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id งานจาก params

    // ค้นหา milestone ที่เกี่ยวข้องกับงานนี้
    const milestones = await Milestone.find({ jobId: id });

    // ตอบกลับข้อมูล milestone
    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, milestones);
  });

  /**
   * สร้าง milestone ให้กับงาน
   */
  createMilestone = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id งานจาก params
    const { title, description, amount, dueDate } = req.body; // รับข้อมูล milestone จาก body
    const employerId = req.user!._id; // รับ id ผู้สร้างงาน

    // ค้นหางานที่ต้องการเพิ่ม milestone
    const job = await Job.findOne({ _id: id, employerId }) as JobDocument | null;

    // ถ้าไม่เจองาน ตอบกลับว่าไม่พบ
    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบว่างานเป็นประเภท contract หรือไม่
    if (job.type !== 'contract') {
      responseHelper.error(res, 'Milestones can only be created for contract jobs', 400);
      return;
    }

    // สร้าง milestone ใหม่
    const milestone = new Milestone({
      jobId: id,
      title,
      description,
      amount,
      dueDate
    });

    // บันทึก milestone ลงฐานข้อมูล
    await milestone.save();

    // เพิ่ม milestone เข้าไปในงาน
    job.addMilestone(milestone._id.toString());
    await job.save();

    // แจ้งเตือน worker ถ้ามีการมอบหมายงาน
    if (job.workerId) {
      await (Notification as any).createMilestoneNotification(
        job.workerId,
        milestone._id,
        'New Milestone Created',
        `A new milestone "${title}" has been created for ${job.title}`,
        `/jobs/${job._id}/milestones`
      );
    }

    // ตอบกลับว่าสร้าง milestone สำเร็จ
    responseHelper.created(res, SUCCESS_MESSAGES.MILESTONE_CREATED, milestone);
  });

  /**
   * ดึงงานที่ผู้ใช้สร้างเอง
   */
  getMyCreatedJobs = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const employerId = req.user!._id; // รับ id ผู้สร้างงาน
    const { page = 1, limit = 10, status } = req.query; // รับค่าจาก query

    let query: any = { employerId };
    if (status) query.status = status;

    // ค้นหางานที่ผู้ใช้สร้างเอง
    const jobs = await Job.find(query)
      .populate('workerId', 'name email profilePic')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    // นับจำนวนงานทั้งหมด
    const total = await Job.countDocuments(query);

    // ตอบกลับข้อมูลงานแบบ paginated
    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      jobs,
      Number(page),
      Number(limit),
      total
    );
  });

  /**
   * ดึงงานที่ผู้ใช้สมัครเอง
   */
  getMyAppliedJobs = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const workerId = req.user!._id; // รับ id worker
    const { page = 1, limit = 10 } = req.query; // รับค่าจาก query

    // ค้นหางานที่ผู้ใช้สมัครเอง
    const jobs = await Job.find({ applicants: workerId })
      .populate('employerId', 'name email profilePic')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    // นับจำนวนงานทั้งหมดที่สมัคร
    const total = await Job.countDocuments({ applicants: workerId });

    // ตอบกลับข้อมูลงานแบบ paginated
    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      jobs,
      Number(page),
      Number(limit),
      total
    );
  });

  /**
   * ดึงงานที่ถูกมอบหมายให้ผู้ใช้
   */
  getMyAssignedJobs = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const workerId = req.user!._id; // รับ id worker
    const { page = 1, limit = 10, status } = req.query; // รับค่าจาก query

    let query: any = { workerId };
    if (status) query.status = status;

    // ค้นหางานที่ถูกมอบหมายให้ผู้ใช้
    const jobs = await Job.find(query)
      .populate('employerId', 'name email profilePic')
      .populate('milestones')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    // นับจำนวนงานทั้งหมดที่ถูกมอบหมาย
    const total = await Job.countDocuments(query);

    // ตอบกลับข้อมูลงานแบบ paginated
    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      jobs,
      Number(page),
      Number(limit),
      total
    );
  });

  /**
   * ดึงหมวดหมู่งานยอดนิยม
   */
  getJobCategories = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    // ใช้ aggregate เพื่อรวมจำนวนงานแต่ละหมวดหมู่
    const categories = await Job.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    // แปลงข้อมูลให้อยู่ในรูปแบบที่ต้องการ
    const formattedCategories = categories.map(cat => ({
      name: cat._id,
      count: cat.count
    }));

    // ตอบกลับข้อมูลหมวดหมู่งาน
    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, {
      popular: formattedCategories,
      all: JOB_CATEGORIES
    });
  });

  /**
   * ค้นหางาน
   */
  searchJobs = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { q, page = 1, limit = 10, category, type, minBudget, maxBudget } = req.query; // รับค่าจาก query

    const searchQuery = q as string; // กำหนด searchQuery จาก q
    const jobs = await (Job as any).searchJobs(searchQuery); // ค้นหางานด้วย searchJobs

    // กรองงานเพิ่มเติมตาม category, type, budget
    let filteredJobs = jobs;
    if (category) {
      filteredJobs = filteredJobs.filter((job: any) => 
        job.category.toLowerCase().includes((category as string).toLowerCase())
      );
    }

    if (type) {
      filteredJobs = filteredJobs.filter((job: any) => job.type === type);
    }

    if (minBudget) {
      filteredJobs = filteredJobs.filter((job: any) => job.budget >= Number(minBudget));
    }

    if (maxBudget) {
      filteredJobs = filteredJobs.filter((job: any) => job.budget <= Number(maxBudget));
    }

    // ทำ pagination
    const skip = (Number(page) - 1) * Number(limit);
    const paginatedJobs = filteredJobs.slice(skip, skip + Number(limit));

    // ตอบกลับข้อมูลงานแบบ paginated
    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      paginatedJobs,
      Number(page),
      Number(limit),
      filteredJobs.length
    );
  });
}