import { Response } from 'express';
import { AuthRequest, IUser, IJob, IMilestone, ITransaction, INotificationModel } from '@/types';
import User from '../Models/User';
import Transaction from '../Models/Transaction';
import Job from '../Models/Job';
import Milestone from '../Models/Milestone';
import Notification from '../Models/Nontification';
import { responseHelper } from '@/utils/responseHelper';
import { catchAsync } from '../Middleware/errorHandle';
import { SUCCESS_MESSAGES, ERROR_MESSAGES, MOCK_PAYMENT_CONFIG } from '@/utils/constants';
import { SocketService } from '@/config/socket';
import { WalletService } from '../Services/walletService';

export class WalletController {
  private socketService = SocketService.getInstance();
  private walletService = new WalletService();

  /**
   * Get wallet balance and summary
   */
  getWalletBalance = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;

    const user = await User.findById(userId) as IUser | null;
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    // Get transaction summary
    const transactionStats = await (Transaction as any).getTransactionStats(userId);
    
    // Get pending transactions
    const pendingTransactions = await Transaction.find({
      $or: [{ from: userId }, { to: userId }],
      status: 'pending'
    }).populate('from to', 'name email').limit(10) as ITransaction[];

    const walletData = {
      balance: user.wallet,
      pendingIn: await Transaction.aggregate([
        { $match: { to: userId, status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(result => result[0]?.total || 0),
      pendingOut: await Transaction.aggregate([
        { $match: { from: userId, status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(result => result[0]?.total || 0),
      totalEarned: transactionStats.completedVolume || 0,
      recentTransactions: pendingTransactions,
      stats: transactionStats
    };

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, walletData);
  });

  /**
   * Get transaction history with filtering
   */
  getTransactionHistory = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { 
      page = 1, 
      limit = 10, 
      type, 
      status, 
      direction = 'all' 
    } = req.query;

    const options = {
      page: Number(page),
      limit: Number(limit),
      type,
      status,
      sort: '-createdAt'
    };

    let transactions: ITransaction[];
    let total: number;

    switch (direction) {
      case 'sent':
        transactions = await (Transaction as any).findSentByUser(userId, options);
        total = await Transaction.countDocuments({ from: userId });
        break;
      case 'received':
        transactions = await (Transaction as any).findReceivedByUser(userId, options);
        total = await Transaction.countDocuments({ to: userId });
        break;
      default:
        transactions = await (Transaction as any).findByUser(userId, options);
        total = await Transaction.countDocuments({
          $or: [{ from: userId }, { to: userId }]
        });
    }

    // Add direction indicator for each transaction
    const transactionsWithDirection = transactions.map(transaction => {
      const txn = transaction.toJSON();
      txn.direction = txn.from.toString() === userId ? 'sent' : 'received';
      return txn;
    });

    responseHelper.paginated(
      res,
      SUCCESS_MESSAGES.DATA_RETRIEVED,
      transactionsWithDirection,
      Number(page),
      Number(limit),
      total
    );
  });

  /**
   * Send payment to another user
   */
  sendPayment = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const fromUserId = req.user!._id;
    const { toUserId, amount, description, type = 'bonus' } = req.body;

    // Validate inputs
    if (fromUserId === toUserId) {
      responseHelper.error(res, 'Cannot send payment to yourself', 400);
      return;
    }

    if (amount <= 0) {
      responseHelper.error(res, 'Amount must be greater than 0', 400);
      return;
    }

    // Check sender balance
    const sender = await User.findById(fromUserId) as IUser | null;
    if (!sender || sender.wallet < amount) {
      responseHelper.error(res, ERROR_MESSAGES.INSUFFICIENT_BALANCE, 400);
      return;
    }

    // Check receiver exists
    const receiver = await User.findById(toUserId) as IUser | null;
    if (!receiver) {
      responseHelper.notFound(res, 'Receiver not found');
      return;
    }

    try {
      // Process payment through wallet service
      const transaction = await this.walletService.processPayment({
        from: fromUserId,
        to: toUserId,
        amount,
        type: type as any,
        description
      });

      // Send notifications
      await (Notification as INotificationModel).createPaymentNotification(
        toUserId,
        transaction._id,
        'Payment Received',
        `You received $${amount} from ${sender.name}`,
        `/wallet/transactions/${transaction._id}`
      );

      await (Notification as INotificationModel).createPaymentNotification(
        fromUserId,
        transaction._id,
        'Payment Sent',
        `You sent $${amount} to ${receiver.name}`,
        `/wallet/transactions/${transaction._id}`
      );

      // Send real-time notifications
      if (typeof this.socketService.sendPaymentNotification === 'function') {
        this.socketService.sendPaymentNotification(toUserId, amount, 'received', transaction._id);
        this.socketService.sendPaymentNotification(fromUserId, amount, 'sent', transaction._id);
      }

      responseHelper.success(res, SUCCESS_MESSAGES.PAYMENT_SENT, transaction);
    } catch (error: any) {
      responseHelper.error(res, error.message || ERROR_MESSAGES.PAYMENT_FAILED, 500);
    }
  });

  /**
   * Process job payment
   */
  processJobPayment = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const employerId = req.user!._id;
    const { jobId, amount, description } = req.body;

    const job = await Job.findOne({ _id: jobId, employerId }) as IJob | null;
    if (!job) {
      responseHelper.notFound(res, ERROR_MESSAGES.JOB_NOT_FOUND);
      return;
    }

    if (!job.workerId) {
      responseHelper.error(res, 'Job has no assigned worker', 400);
      return;
    }

    if (job.status !== 'completed') {
      responseHelper.error(res, 'Job must be completed before payment', 400);
      return;
    }

    try {
      const transaction = await this.walletService.processJobPayment({
        jobId: job._id,
        employerId,
        workerId: job.workerId,
        amount,
        description: description || `Payment for job: ${job.title}`
      });

      // Update job status if needed
      // job.status = 'paid'; // if you have this status
      // await job.save();

      responseHelper.success(res, SUCCESS_MESSAGES.PAYMENT_SUCCESS, transaction);
    } catch (error: any) {
      responseHelper.error(res, error.message || ERROR_MESSAGES.PAYMENT_FAILED, 500);
    }
  });

  /**
   * Process milestone payment
   */
  processMilestonePayment = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const employerId = req.user!._id;
    const { milestoneId } = req.body;

    const milestone = await Milestone.findById(milestoneId).populate('jobId') as IMilestone | null;
    if (!milestone) {
      responseHelper.notFound(res, 'Milestone not found');
      return;
    }

    const job = milestone.jobId as any;
    if (job.employerId.toString() !== employerId) {
      responseHelper.error(res, 'Access denied', 403);
      return;
    }

    if (milestone.status !== 'completed') {
      responseHelper.error(res, 'Milestone must be completed before payment', 400);
      return;
    }

    try {
      const transaction = await this.walletService.processMilestonePayment({
        milestoneId: milestone._id,
        employerId,
        workerId: job.workerId,
        amount: milestone.amount,
        description: `Milestone payment: ${milestone.title}`
      });

      // Mark milestone as paid
      await milestone.markPaid();

      // Send notification
      if (typeof this.socketService.sendMilestoneUpdateNotification === 'function') {
        this.socketService.sendMilestoneUpdateNotification(
          job.workerId,
          milestone._id,
          'paid',
          milestone.amount
        );
      }

      responseHelper.success(res, SUCCESS_MESSAGES.MILESTONE_PAID, transaction);
    } catch (error: any) {
      responseHelper.error(res, error.message || ERROR_MESSAGES.PAYMENT_FAILED, 500);
    }
  });

  /**
   * Add funds to wallet (mock top-up)
   */
  addFunds = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { amount, paymentMethod = 'mock_card' } = req.body;

    if (amount <= 0) {
      responseHelper.error(res, 'Amount must be greater than 0', 400);
      return;
    }

    if (amount > 10000) {
      responseHelper.error(res, 'Maximum top-up amount is $10,000', 400);
      return;
    }

    try {
      // Mock payment processing
      const isSuccessful = Math.random() < MOCK_PAYMENT_CONFIG.SUCCESS_RATE;
      
      if (!isSuccessful) {
        const failureReason = MOCK_PAYMENT_CONFIG.FAILURE_REASONS[
          Math.floor(Math.random() * MOCK_PAYMENT_CONFIG.FAILURE_REASONS.length)
        ];
        responseHelper.error(res, `Payment failed: ${failureReason}`, 400);
        return;
      }

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, MOCK_PAYMENT_CONFIG.PROCESSING_TIME_MS));

      // Add funds to wallet
      const user = await User.findById(userId) as IUser | null;
      if (!user) {
        responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
        return;
      }

      await user.updateWallet(amount, 'add');

      // Create transaction record
      const transaction = await Transaction.create({
        type: 'bonus',
        from: userId, // Self-funding
        to: userId,
        amount,
        status: 'completed',
        description: `Wallet top-up via ${paymentMethod}`,
        reference: `TOP_UP_${Date.now()}`
      }) as ITransaction;

      // Send notification
      await (Notification as INotificationModel).createPaymentNotification(
        userId,
        transaction._id,
        'Funds Added',
        `$${amount} has been added to your wallet`,
        '/wallet'
      );

      responseHelper.success(res, 'Funds added successfully', {
        transaction,
        newBalance: user.wallet
      });
    } catch (error: any) {
      responseHelper.error(res, error.message || 'Failed to add funds', 500);
    }
  });

  /**
   * Withdraw funds from wallet (mock withdrawal)
   */
  withdrawFunds = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { amount, withdrawalMethod = 'bank_transfer' } = req.body;

    if (amount <= 0) {
      responseHelper.error(res, 'Amount must be greater than 0', 400);
      return;
    }

    const user = await User.findById(userId) as IUser | null;
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    if (user.wallet < amount) {
      responseHelper.error(res, ERROR_MESSAGES.INSUFFICIENT_BALANCE, 400);
      return;
    }

    try {
      // Mock withdrawal processing
      const isSuccessful = Math.random() < MOCK_PAYMENT_CONFIG.SUCCESS_RATE;
      
      if (!isSuccessful) {
        const failureReason = MOCK_PAYMENT_CONFIG.FAILURE_REASONS[
          Math.floor(Math.random() * MOCK_PAYMENT_CONFIG.FAILURE_REASONS.length)
        ];
        responseHelper.error(res, `Withdrawal failed: ${failureReason}`, 400);
        return;
      }

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, MOCK_PAYMENT_CONFIG.PROCESSING_TIME_MS));

      // Deduct from wallet
      await user.updateWallet(amount, 'subtract');

      // Create transaction record
      const transaction = await Transaction.create({
        type: 'refund',
        from: userId,
        to: userId, // Self-withdrawal
        amount,
        status: 'completed',
        description: `Wallet withdrawal via ${withdrawalMethod}`,
        reference: `WITHDRAW_${Date.now()}`
      }) as ITransaction;

      // Send notification
      await (Notification as INotificationModel).createPaymentNotification(
        userId,
        transaction._id,
        'Funds Withdrawn',
        `$${amount} has been withdrawn from your wallet`,
        '/wallet'
      );

      responseHelper.success(res, 'Withdrawal processed successfully', {
        transaction,
        newBalance: user.wallet
      });
    } catch (error: any) {
      responseHelper.error(res, error.message || 'Failed to process withdrawal', 500);
    }
  });

  /**
   * Get wallet statistics
   */
  getWalletStats = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(period));

    // Get transaction statistics
    const stats = await Transaction.aggregate([
      {
        $match: {
          $or: [{ from: userId }, { to: userId }],
          createdAt: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalReceived: {
            $sum: {
              $cond: [{ $eq: ['$to', userId] }, '$amount', 0]
            }
          },
          totalSent: {
            $sum: {
              $cond: [{ $eq: ['$from', userId] }, '$amount', 0]
            }
          },
          transactionCount: { $sum: 1 }
        }
      }
    ]);

    // Get monthly breakdown
    const monthlyStats = await Transaction.aggregate([
      {
        $match: {
          $or: [{ from: userId }, { to: userId }],
          createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            month: { $month: '$createdAt' },
            year: { $year: '$createdAt' }
          },
          received: {
            $sum: {
              $cond: [{ $eq: ['$to', userId] }, '$amount', 0]
            }
          },
          sent: {
            $sum: {
              $cond: [{ $eq: ['$from', userId] }, '$amount', 0]
            }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const walletStats = {
      period: `${period} days`,
      summary: stats[0] || { totalReceived: 0, totalSent: 0, transactionCount: 0 },
      monthlyBreakdown: monthlyStats,
      netIncome: (stats[0]?.totalReceived || 0) - (stats[0]?.totalSent || 0)
    };

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, walletStats);
  });

  /**
   * Get transaction by ID
   */
  getTransactionById = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!._id;

    const transaction = await Transaction.findOne({
      _id: id,
      $or: [{ from: userId }, { to: userId }]
    })
    .populate('from', 'name email profilePic')
    .populate('to', 'name email profilePic')
    .populate('jobId', 'title')
    .populate('milestoneId', 'title') as ITransaction | null;

    if (!transaction) {
      responseHelper.notFound(res, 'Transaction not found');
      return;
    }

    const transactionData = transaction.toJSON();
    transactionData.direction = transactionData.from.toString() === userId ? 'sent' : 'received';

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, transactionData);
  });

  /**
   * Cancel pending transaction
   */
  cancelTransaction = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user!._id;

    const transaction = await Transaction.findOne({
      _id: id,
      from: userId,
      status: 'pending'
    }) as ITransaction | null;

    if (!transaction) {
      responseHelper.notFound(res, 'Transaction not found or cannot be cancelled');
      return;
    }

    await transaction.cancel();

    // Refund amount to sender if it was already deducted
    const sender = await User.findById(userId) as IUser | null;
    if (sender) {
      await sender.updateWallet(transaction.amount, 'add');
    }

    // Notify both parties
    await (Notification as INotificationModel).createPaymentNotification(
      transaction.from.toString(),
      transaction._id,
      'Transaction Cancelled',
      `Transaction of $${transaction.amount} has been cancelled`,
      null
    );

    await (Notification as INotificationModel).createPaymentNotification(
      transaction.to.toString(),
      transaction._id,
      'Transaction Cancelled',
      `Expected payment of $${transaction.amount} has been cancelled`,
      null
    );

    responseHelper.success(res, 'Transaction cancelled successfully');
  });

  /**
   * Get pending payments (for employers to see what they owe)
   */
  getPendingPayments = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id;
    const userRole = req.user!.role;

    let pendingPayments: any[] = [];

    if (userRole === 'employer') {
      // Get completed milestones that haven't been paid
      const unpaidMilestones = await Milestone.find({ status: 'completed' })
        .populate({
          path: 'jobId',
          match: { employerId: userId },
          populate: { path: 'workerId', select: 'name email profilePic' }
        }) as IMilestone[];

      pendingPayments = unpaidMilestones
        .filter(milestone => milestone.jobId)
        .map(milestone => ({
          id: milestone._id,
          type: 'milestone',
          title: milestone.title,
          amount: milestone.amount,
          job: milestone.jobId,
          dueDate: milestone.dueDate,
          overdue: milestone.dueDate ? new Date() > milestone.dueDate : false
        }));
    } else {
      // Get pending transactions to this worker
      pendingPayments = await Transaction.find({
        to: userId,
        status: 'pending'
      })
      .populate('from', 'name email profilePic')
      .populate('jobId', 'title')
      .populate('milestoneId', 'title') as ITransaction[];
    }

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, pendingPayments);
  });
}