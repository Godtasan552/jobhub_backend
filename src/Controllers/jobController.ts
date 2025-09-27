import { Response } from 'express';
import { AuthRequest, IUser } from '@/types/index';
import Job from '../Models/Job';
import { JobDocument } from '../Models/Job';
import User from '../Models/User';
import Milestone from '../Models/Milestone';
import Notification from '../Models/Nontification';
import { responseHelper } from '@/utils/responseHelper';
import { catchAsync } from '../Middleware/errorHandler';
import { SUCCESS_MESSAGES, ERROR_MESSAGES, JOB_CATEGORIES } from '@/utils/constants';
import { SocketService } from '@/config/socket';

export class JobController {
  private socketService = SocketService.getInstance();

  /**
   * ดึงงานทั้งหมด พร้อม filter และ pagination
   */
  getAllJobs = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      type,
      minBudget,
      maxBudget,
      status = 'active',
      sort = '-createdAt'
    } = req.query;

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

    const jobs = await (Job as any).findWithFilters({}, options);
    const total = await Job.countDocuments({ status: 'active' });

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
    const { id } = req.params;

    const job = await Job.findById(id)
      .populate('employerId', 'name email profilePic')
      .populate('workerId', 'name email profilePic')
      .populate('milestones');

    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, job);
  });

  /**
   * สร้างงานใหม่ - Updated: ตรวจสอบ employer role
   */
  createJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const user = req.user! as IUser;
    const employerId = user._id;

    // ตรวจสอบว่าผู้ใช้เป็น employer หรือไม่
    if (!user.role.includes('employer')) {
      responseHelper.forbidden(res, 'Only employers can create jobs');
      return;
    }

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

    await job.save();

    // ค้นหา approved workers ที่เกี่ยวข้องกับงานนี้
    const relevantWorkers = await User.find({
      role: 'worker',
      isWorkerApproved: true, // เฉพาะ worker ที่อนุมัติแล้ว
      $or: [
        { categories: { $in: [category] } },
        { skills: { $regex: new RegExp(title.split(' ').join('|'), 'i') } }
      ],
      isActive: true
    }).limit(50);

    // ส่ง notification ไปยัง approved workers เท่านั้น
    for (const worker of relevantWorkers) {
      await (Notification as any).createJobNotification(
        worker._id,
        job._id,
        'New Job Available',
        `A new ${type} job "${title}" in ${category} is available`,
        `/jobs/${job._id}`
      );

      this.socketService.sendNotificationToUser(worker._id.toString(), {
        type: 'job',
        title: 'New Job Available',
        message: `${title} - ${category}`,
        data: { jobId: job._id }
      });
    }

    responseHelper.created(res, SUCCESS_MESSAGES.JOB_CREATED, job);
  });

  /**
   * อัพเดทงาน - Updated: ตรวจสอบ ownership หรือ admin
   */
  updateJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const user = req.user! as IUser;
    const updates = req.body;

    // ค้นหางาน
    const job = await Job.findById(id) as JobDocument | null;

    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบสิทธิ์: เจ้าของงาน หรือ admin
    const isOwner = job.employerId.toString() === user._id.toString();
    const isAdmin = user.role.includes('admin');

    if (!isOwner && !isAdmin) {
      responseHelper.forbidden(res, 'Access denied. You can only edit your own jobs.');
      return;
    }

    if (!job.isEditable() && !isAdmin) {
      responseHelper.error(res, ERROR_MESSAGES.JOB_NOT_EDITABLE, 400);
      return;
    }

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

    responseHelper.success(res, SUCCESS_MESSAGES.JOB_UPDATED, job);
  });

  /**
   * ลบงาน - Updated: ตรวจสอบ ownership หรือ admin
   */
  deleteJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const user = req.user! as IUser;

    const job = await Job.findById(id) as JobDocument | null;

    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบสิทธิ์: เจ้าของงาน หรือ admin
    const isOwner = job.employerId.toString() === user._id.toString();
    const isAdmin = user.role.includes('admin');

    if (!isOwner && !isAdmin) {
      responseHelper.forbidden(res, 'Access denied. You can only delete your own jobs.');
      return;
    }

    // Admin สามารถลบงานได้แม้จะ in_progress
    if (job.status === 'in_progress' && !isAdmin) {
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

    await Job.findByIdAndDelete(id);

    responseHelper.success(res, SUCCESS_MESSAGES.JOB_DELETED);
  });

  /**
   * สมัครงาน - Updated: ตรวจสอบ approved worker
   */
  applyToJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const user = req.user! as IUser;
    const workerId = user._id;

    // ตรวจสอบว่าเป็น approved worker หรือไม่
    if (!user.role.includes('worker')) {
      responseHelper.forbidden(res, 'Only workers can apply to jobs');
      return;
    }

    if (!user.isWorkerApproved) {
      responseHelper.forbidden(res, 'Worker approval required. Please wait for admin approval.');
      return;
    }

    const job = await Job.findById(id) as JobDocument | null;

    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบว่าไม่ใช่เจ้าของงาน
    if (job.employerId.toString() === workerId.toString()) {
      responseHelper.error(res, 'Cannot apply to your own job', 400);
      return;
    }

    if (!job.canUserApply(workerId)) {
      responseHelper.error(res, 'Cannot apply to this job', 400);
      return;
    }

    job.addApplicant(workerId);
    await job.save();

    await (Notification as any).createJobNotification(
      job.employerId,
      job._id,
      'New Job Application',
      `Someone applied for "${job.title}"`,
      `/jobs/${job._id}/applications`
    );

    this.socketService.sendNotificationToUser(job.employerId.toString(), {
      type: 'job',
      title: 'New Application',
      message: `New application for ${job.title}`,
      data: { jobId: job._id }
    });

    responseHelper.success(res, SUCCESS_MESSAGES.JOB_APPLICATION_SUBMITTED);
  });

  /**
   * ดึงข้อมูลผู้สมัครงาน - Updated: ตรวจสอบ ownership หรือ admin
   */
  getJobApplications = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const user = req.user! as IUser;

    const job = await Job.findById(id)
      .populate('applicants', 'name email profilePic skills categories') as JobDocument | null;

    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบสิทธิ์: เจ้าของงาน หรือ admin
    const isOwner = job.employerId.toString() === user._id.toString();
    const isAdmin = user.role.includes('admin');

    if (!isOwner && !isAdmin) {
      responseHelper.forbidden(res, 'Access denied. Only job owner or admin can view applications.');
      return;
    }

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
   * มอบหมายงานให้ worker - Updated: ตรวจสอบ ownership หรือ admin
   */
  assignJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { workerId } = req.body;
    const user = req.user! as IUser;

    const job = await Job.findById(id) as JobDocument | null;

    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบสิทธิ์: เจ้าของงาน หรือ admin
    const isOwner = job.employerId.toString() === user._id.toString();
    const isAdmin = user.role.includes('admin');

    if (!isOwner && !isAdmin) {
      responseHelper.forbidden(res, 'Access denied. Only job owner or admin can assign jobs.');
      return;
    }

    if (job.status !== 'active') {
      responseHelper.error(res, 'Job is not active', 400);
      return;
    }

    if (!job.applicants.includes(workerId)) {
      responseHelper.error(res, 'Worker has not applied to this job', 400);
      return;
    }

    // ตรวจสอบว่า worker ยังเป็น approved worker อยู่หรือไม่
    const worker = await User.findById(workerId);
    if (!worker || !worker.role.includes('worker') || !worker.isWorkerApproved) {
      responseHelper.error(res, 'Worker is not approved or no longer active', 400);
      return;
    }

    await job.assignWorker(workerId);

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

    this.socketService.sendNotificationToUser(workerId, {
      type: 'job',
      title: 'Job Assigned',
      message: `You got the job: ${job.title}`,
      data: { jobId: job._id }
    });

    responseHelper.success(res, SUCCESS_MESSAGES.JOB_ASSIGNED);
  });

  /**
   * ทำงานให้เสร็จสิ้น - Updated: ตรวจสอบ assigned worker หรือ admin
   */
  completeJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const user = req.user! as IUser;

    const job = await Job.findById(id) as JobDocument | null;

    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบสิทธิ์: assigned worker หรือ admin
    const isAssignedWorker = job.workerId?.toString() === user._id.toString();
    const isAdmin = user.role.includes('admin');

    if (!isAssignedWorker && !isAdmin) {
      responseHelper.forbidden(res, 'Access denied. Only assigned worker or admin can complete jobs.');
      return;
    }

    if (job.status !== 'in_progress') {
      responseHelper.error(res, 'Job is not in progress', 400);
      return;
    }

    await job.completeJob();

    await (Notification as any).createJobNotification(
      job.employerId,
      job._id,
      'Job Completed',
      `"${job.title}" has been marked as completed`,
      `/jobs/${job._id}`
    );

    this.socketService.sendNotificationToUser(job.employerId.toString(), {
      type: 'job',
      title: 'Job Completed',
      message: `${job.title} is ready for review`,
      data: { jobId: job._id }
    });

    responseHelper.success(res, SUCCESS_MESSAGES.JOB_COMPLETED);
  });

  /**
   * ยกเลิกงาน - Updated: ตรวจสอบ ownership หรือ admin
   */
  cancelJob = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const user = req.user! as IUser;

    const job = await Job.findById(id) as JobDocument | null;

    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบสิทธิ์: เจ้าของงาน หรือ admin
    const isOwner = job.employerId.toString() === user._id.toString();
    const isAdmin = user.role.includes('admin');

    if (!isOwner && !isAdmin) {
      responseHelper.forbidden(res, 'Access denied. Only job owner or admin can cancel jobs.');
      return;
    }

    await job.cancelJob();

    if (job.workerId) {
      await (Notification as any).createJobNotification(
        job.workerId,
        job._id,
        'Job Cancelled',
        `The job "${job.title}" has been cancelled`,
        null
      );
    }

    responseHelper.success(res, 'Job cancelled successfully');
  });

  /**
   * ดึง milestone ของงาน
   */
  getJobMilestones = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    const milestones = await Milestone.find({ jobId: id });

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, milestones);
  });

  /**
   * สร้าง milestone ให้กับงาน - Updated: ตรวจสอบ ownership หรือ admin
   */
  createMilestone = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { title, description, amount, dueDate } = req.body;
    const user = req.user! as IUser;

    const job = await Job.findById(id) as JobDocument | null;

    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    // ตรวจสอบสิทธิ์: เจ้าของงาน หรือ admin
    const isOwner = job.employerId.toString() === user._id.toString();
    const isAdmin = user.role.includes('admin');

    if (!isOwner && !isAdmin) {
      responseHelper.forbidden(res, 'Access denied. Only job owner or admin can create milestones.');
      return;
    }

    if (job.type !== 'contract') {
      responseHelper.error(res, 'Milestones can only be created for contract jobs', 400);
      return;
    }

    const milestone = new Milestone({
      jobId: id,
      title,
      description,
      amount,
      dueDate
    });

    await milestone.save();

    job.addMilestone(milestone._id.toString());
    await job.save();

    if (job.workerId) {
      await (Notification as any).createMilestoneNotification(
        job.workerId,
        milestone._id,
        'New Milestone Created',
        `A new milestone "${title}" has been created for ${job.title}`,
        `/jobs/${job._id}/milestones`
      );
    }

    responseHelper.created(res, SUCCESS_MESSAGES.MILESTONE_CREATED, milestone);
  });

  /**
   * ดึงงานที่ผู้ใช้สร้างเอง - Updated: รองรับ employer role
   */
  getMyCreatedJobs = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const user = req.user! as IUser;
    const { page = 1, limit = 10, status } = req.query;

    // ตรวจสอบว่าเป็น employer หรือไม่
    if (!user.role.includes('employer')) {
      responseHelper.forbidden(res, 'Only employers can view created jobs');
      return;
    }

    let query: any = { employerId: user._id };
    if (status) query.status = status;

    const jobs = await Job.find(query)
      .populate('workerId', 'name email profilePic')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Job.countDocuments(query);

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
   * ดึงงานที่ผู้ใช้สมัครเอง - Updated: รองรับ worker role
   */
  getMyAppliedJobs = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const user = req.user! as IUser;
    const { page = 1, limit = 10 } = req.query;

    // ตรวจสอบว่าเป็น worker หรือไม่
    if (!user.role.includes('worker')) {
      responseHelper.forbidden(res, 'Only workers can view applied jobs');
      return;
    }

    const jobs = await Job.find({ applicants: user._id })
      .populate('employerId', 'name email profilePic')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Job.countDocuments({ applicants: user._id });

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
   * ดึงงานที่ถูกมอบหมายให้ผู้ใช้ - Updated: รองรับ worker role
   */
  getMyAssignedJobs = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const user = req.user! as IUser;
    const { page = 1, limit = 10, status } = req.query;

    // ตรวจสอบว่าเป็น worker หรือไม่
    if (!user.role.includes('worker')) {
      responseHelper.forbidden(res, 'Only workers can view assigned jobs');
      return;
    }

    let query: any = { workerId: user._id };
    if (status) query.status = status;

    const jobs = await Job.find(query)
      .populate('employerId', 'name email profilePic')
      .populate('milestones')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Job.countDocuments(query);

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
  getJobCategories = catchAsync(async (_req: AuthRequest, res: Response): Promise<void> => {
    const categories = await Job.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    const formattedCategories = categories.map(cat => ({
      name: cat._id,
      count: cat.count
    }));

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, {
      popular: formattedCategories,
      all: JOB_CATEGORIES
    });
  });

  /**
   * ค้นหางาน
   */
  searchJobs = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { q, page = 1, limit = 10, category, type, minBudget, maxBudget } = req.query;

    const searchQuery = q as string;
    const jobs = await (Job as any).searchJobs(searchQuery);

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

    const skip = (Number(page) - 1) * Number(limit);
    const paginatedJobs = filteredJobs.slice(skip, skip + Number(limit));

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