import { Router } from 'express'; // นำเข้า Router จาก express สำหรับสร้าง route
import { JobController } from '../Controllers/jobController'; // นำเข้า JobController สำหรับจัดการ logic งาน
import { authenticate, requireEmployer, requireWorker, canAccessJob } from '../Middleware/authMiddleware'; // นำเข้า middleware สำหรับตรวจสอบสิทธิ์ผู้ใช้
import { validate, validateQuery, validateParams, jobSchemas, commonSchemas } from '../Middleware/validation'; // นำเข้า middleware สำหรับ validate ข้อมูล
import Joi from 'joi'; // นำเข้า Joi สำหรับ schema validation

const router = Router(); // สร้าง instance ของ Router
const jobController = new JobController(); // สร้าง instance ของ JobController

/**
 * @route   GET /api/v1/jobs
 * @desc    ดึงงานทั้งหมด พร้อม filter และ pagination
 * @access  สาธารณะ
 */
router.get(
  '/', // เส้นทางหลัก
  validateQuery(jobSchemas.jobQuery), // ตรวจสอบ query string ด้วย schema
  jobController.getAllJobs // เรียกใช้ฟังก์ชัน getAllJobs ใน controller
);

/**
 * @route   GET /api/v1/jobs/:id
 * @desc    ดึงงานตาม ID
 * @access  สาธารณะ
 */
router.get(
  '/:id', // เส้นทางที่มี id งาน
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id ที่ส่งมา
  jobController.getJobById // เรียกใช้ฟังก์ชัน getJobById
);

/**
 * @route   POST /api/v1/jobs
 * @desc    สร้างงานใหม่
 * @access  เฉพาะ Employer ที่ login
 */
router.post(
  '/', // เส้นทางหลัก
  authenticate, // ตรวจสอบว่า login แล้ว
  requireEmployer, // ตรวจสอบว่าเป็น employer
  validate(jobSchemas.createJob), // ตรวจสอบข้อมูลที่ส่งมาด้วย schema
  jobController.createJob // เรียกใช้ฟังก์ชัน createJob
);

/**
 * @route   PUT /api/v1/jobs/:id
 * @desc    อัพเดทงาน
 * @access  เฉพาะ Employer ที่ login และเป็นเจ้าของงาน
 */
router.put(
  '/:id', // เส้นทางที่มี id งาน
  authenticate, // ตรวจสอบว่า login แล้ว
  requireEmployer, // ตรวจสอบว่าเป็น employer
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id
  validate(jobSchemas.updateJob), // ตรวจสอบข้อมูลอัพเดท
  jobController.updateJob // เรียกใช้ฟังก์ชัน updateJob
);

/**
 * @route   DELETE /api/v1/jobs/:id
 * @desc    ลบงาน
 * @access  เฉพาะ Employer ที่ login และเป็นเจ้าของงาน
 */
router.delete(
  '/:id', // เส้นทางที่มี id งาน
  authenticate, // ตรวจสอบว่า login แล้ว
  requireEmployer, // ตรวจสอบว่าเป็น employer
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id
  jobController.deleteJob // เรียกใช้ฟังก์ชัน deleteJob
);

/**
 * @route   POST /api/v1/jobs/:id/apply
 * @desc    สมัครงาน
 * @access  เฉพาะ Worker ที่ login
 */
router.post(
  '/:id/apply', // เส้นทางสมัครงาน
  authenticate, // ตรวจสอบว่า login แล้ว
  requireWorker, // ตรวจสอบว่าเป็น worker
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id
  validate(jobSchemas.applyJob), // ตรวจสอบข้อมูลสมัครงาน
  jobController.applyToJob // เรียกใช้ฟังก์ชัน applyToJob
);

/**
 * @route   GET /api/v1/jobs/:id/applications
 * @desc    ดึงข้อมูลผู้สมัครงาน
 * @access  เฉพาะ Employer ที่ login และเป็นเจ้าของงาน
 */
router.get(
  '/:id/applications', // เส้นทางดึงข้อมูลผู้สมัครงาน
  authenticate, // ตรวจสอบว่า login แล้ว
  requireEmployer, // ตรวจสอบว่าเป็น employer
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id
  jobController.getJobApplications // เรียกใช้ฟังก์ชัน getJobApplications
);

/**
 * @route   POST /api/v1/jobs/:id/assign
 * @desc    มอบหมายงานให้ worker
 * @access  เฉพาะ Employer ที่ login และเป็นเจ้าของงาน
 */
router.post(
  '/:id/assign', // เส้นทางมอบหมายงาน
  authenticate, // ตรวจสอบว่า login แล้ว
  requireEmployer, // ตรวจสอบว่าเป็น employer
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id
  validate(Joi.object({ workerId: commonSchemas.objectId.required() })), // ตรวจสอบ workerId ที่จะมอบหมาย
  jobController.assignJob // เรียกใช้ฟังก์ชัน assignJob
);

/**
 * @route   POST /api/v1/jobs/:id/complete
 * @desc    ทำงานให้เสร็จสิ้น
 * @access  เฉพาะ Worker ที่ login และถูกมอบหมายงาน
 */
router.post(
  '/:id/complete', // เส้นทางทำงานให้เสร็จสิ้น
  authenticate, // ตรวจสอบว่า login แล้ว
  requireWorker, // ตรวจสอบว่าเป็น worker
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id
  canAccessJob, // ตรวจสอบสิทธิ์เข้าถึงงาน
  jobController.completeJob // เรียกใช้ฟังก์ชัน completeJob
);

/**
 * @route   POST /api/v1/jobs/:id/cancel
 * @desc    ยกเลิกงาน
 * @access  เฉพาะ Employer ที่ login และเป็นเจ้าของงาน
 */
router.post(
  '/:id/cancel', // เส้นทางยกเลิกงาน
  authenticate, // ตรวจสอบว่า login แล้ว
  requireEmployer, // ตรวจสอบว่าเป็น employer
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id
  jobController.cancelJob // เรียกใช้ฟังก์ชัน cancelJob
);

/**
 * @route   GET /api/v1/jobs/:id/milestones
 * @desc    ดึง milestone ของงาน
 * @access  เฉพาะผู้มีส่วนร่วมในงาน
 */
router.get(
  '/:id/milestones', // เส้นทางดึง milestone
  authenticate, // ตรวจสอบว่า login แล้ว
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id
  canAccessJob, // ตรวจสอบสิทธิ์เข้าถึงงาน
  jobController.getJobMilestones // เรียกใช้ฟังก์ชัน getJobMilestones
);

/**
 * @route   POST /api/v1/jobs/:id/milestones
 * @desc    สร้าง milestone ให้กับงาน
 * @access  เฉพาะ Employer ที่ login และเป็นเจ้าของงาน
 */
router.post(
  '/:id/milestones', // เส้นทางสร้าง milestone
  authenticate, // ตรวจสอบว่า login แล้ว
  requireEmployer, // ตรวจสอบว่าเป็น employer
  validateParams(Joi.object({ id: commonSchemas.objectId.required() })), // ตรวจสอบ id
  validate(Joi.object({
    title: Joi.string().trim().min(3).max(200).required(), // ตรวจสอบ title
    amount: Joi.number().positive().required(), // ตรวจสอบ amount
    description: Joi.string().trim().max(1000), // ตรวจสอบ description
    dueDate: Joi.date().greater('now') // ตรวจสอบ dueDate
  })),
  jobController.createMilestone // เรียกใช้ฟังก์ชัน createMilestone
);

/**
 * @route   GET /api/v1/jobs/my/created
 * @desc    ดึงงานที่ผู้ใช้สร้างเอง
 * @access  เฉพาะ Employer ที่ login
 */
router.get(
  '/my/created', // เส้นทางดึงงานที่สร้างเอง
  authenticate, // ตรวจสอบว่า login แล้ว
  requireEmployer, // ตรวจสอบว่าเป็น employer
  validateQuery(commonSchemas.pagination), // ตรวจสอบ query pagination
  jobController.getMyCreatedJobs // เรียกใช้ฟังก์ชัน getMyCreatedJobs
);

/**
 * @route   GET /api/v1/jobs/my/applied
 * @desc    ดึงงานที่ผู้ใช้สมัครเอง
 * @access  เฉพาะ Worker ที่ login
 */
router.get(
  '/my/applied', // เส้นทางดึงงานที่สมัครเอง
  authenticate, // ตรวจสอบว่า login แล้ว
  requireWorker, // ตรวจสอบว่าเป็น worker
  validateQuery(commonSchemas.pagination), // ตรวจสอบ query pagination
  jobController.getMyAppliedJobs // เรียกใช้ฟังก์ชัน getMyAppliedJobs
);

/**
 * @route   GET /api/v1/jobs/my/assigned
 * @desc    ดึงงานที่ถูกมอบหมายให้ผู้ใช้
 * @access  เฉพาะ Worker ที่ login
 */
router.get(
  '/my/assigned', // เส้นทางดึงงานที่ถูกมอบหมาย
  authenticate, // ตรวจสอบว่า login แล้ว
  requireWorker, // ตรวจสอบว่าเป็น worker
  validateQuery(commonSchemas.pagination), // ตรวจสอบ query pagination
  jobController.getMyAssignedJobs // เรียกใช้ฟังก์ชัน getMyAssignedJobs
);

/**
 * @route   GET /api/v1/jobs/categories
 * @desc    ดึงหมวดหมู่งานยอดนิยม
 * @access  สาธารณะ
 */
router.get(
  '/categories', // เส้นทางดึงหมวดหมู่งาน
  jobController.getJobCategories // เรียกใช้ฟังก์ชัน getJobCategories
);

/**
 * @route   GET /api/v1/jobs/search
 * @desc    ค้นหางาน
 * @access  สาธารณะ
 */
router.get(
  '/search', // เส้นทางค้นหางาน
  validateQuery(Joi.object({
    q: Joi.string().min(1).max(100).required(), // ตรวจสอบ keyword
    page: Joi.number().integer().min(1).default(1), // ตรวจสอบ page
    limit: Joi.number().integer().min(1).max(100).default(10), // ตรวจสอบ limit
    sort: Joi.string().default('-createdAt'), // ตรวจสอบ sort
    search: Joi.string().trim().min(1).max(100), // ตรวจสอบ search
    filter: Joi.object(), // ตรวจสอบ filter
    category: Joi.string().trim().max(100), // ตรวจสอบ category
    type: Joi.string().trim().max(50), // ตรวจสอบ type
    status: Joi.string().trim().max(50), // ตรวจสอบ status
    minBudget: Joi.number().positive(), // ตรวจสอบ minBudget
    maxBudget: Joi.number().positive() // ตรวจสอบ maxBudget
  })),
  jobController.searchJobs // เรียกใช้ฟังก์ชัน searchJobs
);

export default router; // ส่งออก router สำหรับใช้งานใน app