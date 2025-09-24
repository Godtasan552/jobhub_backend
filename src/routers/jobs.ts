import { Router } from 'express';
import { JobController } from '../Controllers/';
import { authenticate, requireEmployer, requireWorker, canAccessJob } from '@/middleware/authMiddleware';
import { validate, validateQuery, validateParams, jobSchemas, commonSchemas } from '@/middleware/validation';

const router = Router();
const jobController = new JobController();

/**
 * @route   GET /api/v1/jobs
 * @desc    Get all jobs with filtering and pagination
 * @access  Public
 */
router.get(
  '/',
  validateQuery(jobSchemas.jobQuery),
  jobController.getAllJobs
);

/**
 * @route   GET /api/v1/jobs/:id
 * @desc    Get job by ID
 * @access  Public
 */
router.get(
  '/:id',
  validateParams({ id: commonSchemas.objectId.required() }),
  jobController.getJobById
);

/**
 * @route   POST /api/v1/jobs
 * @desc    Create a new job
 * @access  Private (Employer only)
 */
router.post(
  '/',
  authenticate,
  requireEmployer,
  validate(jobSchemas.createJob),
  jobController.createJob
);

/**
 * @route   PUT /api/v1/jobs/:id
 * @desc    Update job
 * @access  Private (Employer only - own jobs)
 */
router.put(
  '/:id',
  authenticate,
  requireEmployer,
  validateParams({ id: commonSchemas.objectId.required() }),
  validate(jobSchemas.updateJob),
  jobController.updateJob
);

/**
 * @route   DELETE /api/v1/jobs/:id
 * @desc    Delete job
 * @access  Private (Employer only - own jobs)
 */
router.delete(
  '/:id',
  authenticate,
  requireEmployer,
  validateParams({ id: commonSchemas.objectId.required() }),
  jobController.deleteJob
);

/**
 * @route   POST /api/v1/jobs/:id/apply
 * @desc    Apply to a job
 * @access  Private (Worker only)
 */
router.post(
  '/:id/apply',
  authenticate,
  requireWorker,
  validateParams({ id: commonSchemas.objectId.required() }),
  validate(jobSchemas.applyJob),
  jobController.applyToJob
);

/**
 * @route   GET /api/v1/jobs/:id/applications
 * @desc    Get job applications
 * @access  Private (Employer only - own jobs)
 */
router.get(
  '/:id/applications',
  authenticate,
  requireEmployer,
  validateParams({ id: commonSchemas.objectId.required() }),
  jobController.getJobApplications
);

/**
 * @route   POST /api/v1/jobs/:id/assign
 * @desc    Assign job to a worker
 * @access  Private (Employer only - own jobs)
 */
router.post(
  '/:id/assign',
  authenticate,
  requireEmployer,
  validateParams({ id: commonSchemas.objectId.required() }),
  validate({ workerId: commonSchemas.objectId.required() }),
  jobController.assignJob
);

/**
 * @route   POST /api/v1/jobs/:id/complete
 * @desc    Mark job as completed
 * @access  Private (Worker only - assigned jobs)
 */
router.post(
  '/:id/complete',
  authenticate,
  requireWorker,
  validateParams({ id: commonSchemas.objectId.required() }),
  canAccessJob,
  jobController.completeJob
);

/**
 * @route   POST /api/v1/jobs/:id/cancel
 * @desc    Cancel job
 * @access  Private (Employer only - own jobs)
 */
router.post(
  '/:id/cancel',
  authenticate,
  requireEmployer,
  validateParams({ id: commonSchemas.objectId.required() }),
  jobController.cancelJob
);

/**
 * @route   GET /api/v1/jobs/:id/milestones
 * @desc    Get job milestones
 * @access  Private (Job participants only)
 */
router.get(
  '/:id/milestones',
  authenticate,
  validateParams({ id: commonSchemas.objectId.required() }),
  canAccessJob,
  jobController.getJobMilestones
);

/**
 * @route   POST /api/v1/jobs/:id/milestones
 * @desc    Create milestone for job
 * @access  Private (Employer only - own jobs)
 */
router.post(
  '/:id/milestones',
  authenticate,
  requireEmployer,
  validateParams({ id: commonSchemas.objectId.required() }),
  validate({
    title: jobSchemas.createJob.describe().keys.title,
    amount: jobSchemas.createJob.describe().keys.budget,
    description: jobSchemas.createJob.describe().keys.description,
    dueDate: jobSchemas.createJob.describe().keys.deadline
  }),
  jobController.createMilestone
);

/**
 * @route   GET /api/v1/jobs/my/created
 * @desc    Get jobs created by current employer
 * @access  Private (Employer only)
 */
router.get(
  '/my/created',
  authenticate,
  requireEmployer,
  validateQuery(commonSchemas.pagination),
  jobController.getMyCreatedJobs
);

/**
 * @route   GET /api/v1/jobs/my/applied
 * @desc    Get jobs applied by current worker
 * @access  Private (Worker only)
 */
router.get(
  '/my/applied',
  authenticate,
  requireWorker,
  validateQuery(commonSchemas.pagination),
  jobController.getMyAppliedJobs
);

/**
 * @route   GET /api/v1/jobs/my/assigned
 * @desc    Get jobs assigned to current worker
 * @access  Private (Worker only)
 */
router.get(
  '/my/assigned',
  authenticate,
  requireWorker,
  validateQuery(commonSchemas.pagination),
  jobController.getMyAssignedJobs
);

/**
 * @route   GET /api/v1/jobs/categories
 * @desc    Get popular job categories
 * @access  Public
 */
router.get(
  '/categories',
  jobController.getJobCategories
);

/**
 * @route   GET /api/v1/jobs/search
 * @desc    Search jobs
 * @access  Public
 */
router.get(
  '/search',
  validateQuery({
    q: require('joi').string().min(1).max(100).required(),
    ...commonSchemas.pagination.describe().keys,
    ...commonSchemas.searchFilter.describe().keys
  }),
  jobController.searchJobs
);

export default router;
