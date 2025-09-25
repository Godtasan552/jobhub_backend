import { Response } from 'express'; // นำเข้า Response สำหรับตอบกลับ API
import { AuthRequest, IUser, IJob, IMilestone, ITransaction, INotificationModel } from '@/types'; // นำเข้า type ที่เกี่ยวข้อง
import User from '../Models/User'; // นำเข้าโมเดล User
import Transaction from '../Models/Transaction'; // นำเข้าโมเดล Transaction
import Job from '../Models/Job'; // นำเข้าโมเดล Job
import Milestone from '../Models/Milestone'; // นำเข้าโมเดล Milestone
import Notification from '../Models/Nontification'; // นำเข้าโมเดล Notification
import { responseHelper } from '@/utils/responseHelper'; // นำเข้า helper สำหรับตอบกลับ API
import { catchAsync } from '../Middleware/errorHandle'; // นำเข้า middleware สำหรับจัดการ error
import { SUCCESS_MESSAGES, ERROR_MESSAGES, MOCK_PAYMENT_CONFIG } from '@/utils/constants'; // นำเข้าข้อความคงที่
import { SocketService } from '@/config/socket'; // นำเข้า service สำหรับ socket
import { WalletService } from '../Services/walletService'; // นำเข้า service สำหรับ wallet

export class WalletController {
  private socketService = SocketService.getInstance(); // สร้าง instance สำหรับ socket service
  private walletService = new WalletService(); // สร้าง instance สำหรับ wallet service

  /**
   * ดึงยอดเงินในกระเป๋าและสรุปข้อมูล
   */
  getWalletBalance = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId จาก token

    const user = await User.findById(userId) as IUser | null; // ค้นหาข้อมูลผู้ใช้
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND); // ถ้าไม่เจอผู้ใช้
      return;
    }

    // ดึงสถิติธุรกรรม
    const transactionStats = await (Transaction as any).getTransactionStats(userId);
    
    // ดึงธุรกรรมที่ pending
    const pendingTransactions = await Transaction.find({
      $or: [{ from: userId }, { to: userId }],
      status: 'pending'
    }).populate('from to', 'name email').limit(10) as ITransaction[];

    // สร้างข้อมูล wallet สำหรับตอบกลับ
    const walletData = {
      balance: user.wallet, // ยอดเงินคงเหลือ
      pendingIn: await Transaction.aggregate([
        { $match: { to: userId, status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(result => result[0]?.total || 0), // ยอดเงินที่รอรับ
      pendingOut: await Transaction.aggregate([
        { $match: { from: userId, status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).then(result => result[0]?.total || 0), // ยอดเงินที่รอจ่าย
      totalEarned: transactionStats.completedVolume || 0, // รายได้รวม
      recentTransactions: pendingTransactions, // ธุรกรรมล่าสุด
      stats: transactionStats // สถิติธุรกรรม
    };

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, walletData); // ส่งข้อมูลกลับ
  });

  /**
   * ดึงประวัติธุรกรรม พร้อม filter
   */
  getTransactionHistory = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // รับ userId
    const { 
      page = 1, 
      limit = 10, 
      type, 
      status, 
      direction = 'all' 
    } = req.query; // รับค่าจาก query

    const options = {
      page: Number(page),
      limit: Number(limit),
      type,
      status,
      sort: '-createdAt'
    };

    let transactions: ITransaction[];
    let total: number;

    // เลือกดึงธุรกรรมตามทิศทาง
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

    // เพิ่ม field direction ในแต่ละธุรกรรม
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
   * ส่งเงินให้ผู้ใช้อื่น
   */
  sendPayment = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const fromUserId = req.user!._id; // ผู้ส่งเงิน
    const { toUserId, amount, description, type = 'bonus' } = req.body; // รับข้อมูลจาก body

    // ตรวจสอบห้ามโอนเงินให้ตัวเอง
    if (fromUserId === toUserId) {
      responseHelper.error(res, 'Cannot send payment to yourself', 400);
      return;
    }

    // ตรวจสอบจำนวนเงิน
    if (amount <= 0) {
      responseHelper.error(res, 'Amount must be greater than 0', 400);
      return;
    }

    // ตรวจสอบยอดเงินในกระเป๋าผู้ส่ง
    const sender = await User.findById(fromUserId) as IUser | null;
    if (!sender || sender.wallet < amount) {
      responseHelper.error(res, ERROR_MESSAGES.INSUFFICIENT_BALANCE, 400);
      return;
    }

    // ตรวจสอบผู้รับ
    const receiver = await User.findById(toUserId) as IUser | null;
    if (!receiver) {
      responseHelper.notFound(res, 'Receiver not found');
      return;
    }

    try {
      // ดำเนินการจ่ายเงินผ่าน walletService
      const transaction = await this.walletService.processPayment({
        from: fromUserId,
        to: toUserId,
        amount,
        type: type as any,
        description
      });

      // สร้างแจ้งเตือนให้ผู้รับ
      await (Notification as INotificationModel).createPaymentNotification(
        toUserId,
        transaction._id,
        'Payment Received',
        `You received $${amount} from ${sender.name}`,
        `/wallet/transactions/${transaction._id}`
      );

      // สร้างแจ้งเตือนให้ผู้ส่ง
      await (Notification as INotificationModel).createPaymentNotification(
        fromUserId,
        transaction._id,
        'Payment Sent',
        `You sent $${amount} to ${receiver.name}`,
        `/wallet/transactions/${transaction._id}`
      );

      // ส่งแจ้งเตือนแบบ real-time
      if (typeof this.socketService.sendPaymentNotification === 'function') {
        this.socketService.sendPaymentNotification(toUserId, amount, 'received', transaction._id);
        this.socketService.sendPaymentNotification(fromUserId, amount, 'sent', transaction._id);
      }

      responseHelper.success(res, SUCCESS_MESSAGES.PAYMENT_SENT, transaction); // ตอบกลับสำเร็จ
    } catch (error: any) {
      responseHelper.error(res, error.message || ERROR_MESSAGES.PAYMENT_FAILED, 500); // ตอบกลับ error
    }
  });

  /**
   * จ่ายเงินให้กับงาน
   */
  processJobPayment = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const employerId = req.user!._id; // ผู้จ้าง
    const { jobId, amount, description } = req.body; // รับข้อมูลจาก body

    const job = await Job.findOne({ _id: jobId, employerId }) as IJob | null; // ค้นหางาน
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
      // ดำเนินการจ่ายเงินผ่าน walletService
      const transaction = await this.walletService.processJobPayment({
        jobId: job._id,
        employerId,
        workerId: job.workerId,
        amount,
        description: description || `Payment for job: ${job.title}`
      });

      // อาจจะอัพเดทสถานะงานเป็น paid (ถ้ามี)
      // job.status = 'paid'; // ถ้ามีสถานะนี้
      // await job.save();

      responseHelper.success(res, SUCCESS_MESSAGES.PAYMENT_SUCCESS, transaction); // ตอบกลับสำเร็จ
    } catch (error: any) {
      responseHelper.error(res, error.message || ERROR_MESSAGES.PAYMENT_FAILED, 500); // ตอบกลับ error
    }
  });

  /**
   * จ่ายเงิน milestone
   */
  processMilestonePayment = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const employerId = req.user!._id; // ผู้จ้าง
    const { milestoneId } = req.body; // รับ milestoneId จาก body

    const milestone = await Milestone.findById(milestoneId).populate('jobId') as IMilestone | null; // ค้นหา milestone
    if (!milestone) {
      responseHelper.notFound(res, 'Milestone not found');
      return;
    }

    const job = milestone.jobId as any; // ข้อมูลงานที่ถูก populate
    if (job.employerId.toString() !== employerId) {
      responseHelper.error(res, 'Access denied', 403);
      return;
    }

    if (milestone.status !== 'completed') {
      responseHelper.error(res, 'Milestone must be completed before payment', 400);
      return;
    }

    try {
      // ดำเนินการจ่ายเงิน milestone ผ่าน walletService
      const transaction = await this.walletService.processMilestonePayment({
        milestoneId: milestone._id,
        employerId,
        workerId: job.workerId,
        amount: milestone.amount,
        description: `Milestone payment: ${milestone.title}`
      });

      // mark milestone เป็น paid
      await milestone.markPaid();

      // ส่งแจ้งเตือนแบบ real-time
      if (typeof this.socketService.sendMilestoneUpdateNotification === 'function') {
        this.socketService.sendMilestoneUpdateNotification(
          job.workerId,
          milestone._id,
          'paid',
          milestone.amount
        );
      }

      responseHelper.success(res, SUCCESS_MESSAGES.MILESTONE_PAID, transaction); // ตอบกลับสำเร็จ
    } catch (error: any) {
      responseHelper.error(res, error.message || ERROR_MESSAGES.PAYMENT_FAILED, 500); // ตอบกลับ error
    }
  });

  /**
   * เติมเงินเข้ากระเป๋า (mock top-up)
   */
  addFunds = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // ผู้ใช้
    const { amount, paymentMethod = 'mock_card' } = req.body; // รับข้อมูลจาก body

    if (amount <= 0) {
      responseHelper.error(res, 'Amount must be greater than 0', 400);
      return;
    }

    if (amount > 10000) {
      responseHelper.error(res, 'Maximum top-up amount is $10,000', 400);
      return;
    }

    try {
      // จำลองการจ่ายเงิน (mock)
      const isSuccessful = Math.random() < MOCK_PAYMENT_CONFIG.SUCCESS_RATE;
      
      if (!isSuccessful) {
        const failureReason = MOCK_PAYMENT_CONFIG.FAILURE_REASONS[
          Math.floor(Math.random() * MOCK_PAYMENT_CONFIG.FAILURE_REASONS.length)
        ];
        responseHelper.error(res, `Payment failed: ${failureReason}`, 400);
        return;
      }

      // จำลองดีเลย์
      await new Promise(resolve => setTimeout(resolve, MOCK_PAYMENT_CONFIG.PROCESSING_TIME_MS));

      // เติมเงินเข้ากระเป๋า
      const user = await User.findById(userId) as IUser | null;
      if (!user) {
        responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
        return;
      }

      await user.updateWallet(amount, 'add');

      // สร้างธุรกรรม
      const transaction = await Transaction.create({
        type: 'bonus',
        from: userId, // เติมเงินให้ตัวเอง
        to: userId,
        amount,
        status: 'completed',
        description: `Wallet top-up via ${paymentMethod}`,
        reference: `TOP_UP_${Date.now()}`
      }) as ITransaction;

      // แจ้งเตือน
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
   * ถอนเงินออกจากกระเป๋า (mock withdrawal)
   */
  withdrawFunds = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // ผู้ใช้
    const { amount, withdrawalMethod = 'bank_transfer' } = req.body; // รับข้อมูลจาก body

    if (amount <= 0) {
      responseHelper.error(res, 'Amount must be greater than 0', 400);
      return;
    }

    const user = await User.findById(userId) as IUser | null; // ค้นหาผู้ใช้
    if (!user) {
      responseHelper.notFound(res, ERROR_MESSAGES.USER_NOT_FOUND);
      return;
    }

    if (user.wallet < amount) {
      responseHelper.error(res, ERROR_MESSAGES.INSUFFICIENT_BALANCE, 400);
      return;
    }

    try {
      // จำลองการถอนเงิน (mock)
      const isSuccessful = Math.random() < MOCK_PAYMENT_CONFIG.SUCCESS_RATE;
      
      if (!isSuccessful) {
        const failureReason = MOCK_PAYMENT_CONFIG.FAILURE_REASONS[
          Math.floor(Math.random() * MOCK_PAYMENT_CONFIG.FAILURE_REASONS.length)
        ];
        responseHelper.error(res, `Withdrawal failed: ${failureReason}`, 400);
        return;
      }

      // จำลองดีเลย์
      await new Promise(resolve => setTimeout(resolve, MOCK_PAYMENT_CONFIG.PROCESSING_TIME_MS));

      // หักเงินออกจากกระเป๋า
      await user.updateWallet(amount, 'subtract');

      // สร้างธุรกรรม
      const transaction = await Transaction.create({
        type: 'refund',
        from: userId,
        to: userId, // ถอนเงินให้ตัวเอง
        amount,
        status: 'completed',
        description: `Wallet withdrawal via ${withdrawalMethod}`,
        reference: `WITHDRAW_${Date.now()}`
      }) as ITransaction;

      // แจ้งเตือน
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
   * ดึงสถิติกระเป๋าเงิน
   */
  getWalletStats = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // ผู้ใช้
    const { period = '30' } = req.query; // รับช่วงเวลา (วัน)

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(period)); // คำนวณวันที่เริ่มต้น

    // ดึงสถิติธุรกรรม
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

    // ดึงสถิติรายเดือน
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
      period: `${period} days`, // ช่วงเวลา
      summary: stats[0] || { totalReceived: 0, totalSent: 0, transactionCount: 0 }, // สรุป
      monthlyBreakdown: monthlyStats, // รายเดือน
      netIncome: (stats[0]?.totalReceived || 0) - (stats[0]?.totalSent || 0) // รายรับสุทธิ
    };

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, walletStats); // ส่งข้อมูลกลับ
  });

  /**
   * ดึงธุรกรรมตาม ID
   */
  getTransactionById = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id ธุรกรรม
    const userId = req.user!._id; // ผู้ใช้

    const transaction = await Transaction.findOne({
      _id: id,
      $or: [{ from: userId }, { to: userId }]
    })
    .populate('from', 'name email profilePic')
    .populate('to', 'name email profilePic')
    .populate('jobId', 'title')
    .populate('milestoneId', 'title') as ITransaction | null; // ค้นหาธุรกรรม

    if (!transaction) {
      responseHelper.notFound(res, 'Transaction not found');
      return;
    }

    const transactionData = transaction.toJSON();
    transactionData.direction = transactionData.from.toString() === userId ? 'sent' : 'received';

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, transactionData); // ส่งข้อมูลกลับ
  });

  /**
   * ยกเลิกธุรกรรมที่ pending
   */
  cancelTransaction = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params; // รับ id ธุรกรรม
    const userId = req.user!._id; // ผู้ใช้

    const transaction = await Transaction.findOne({
      _id: id,
      from: userId,
      status: 'pending'
    }) as ITransaction | null; // ค้นหาธุรกรรม

    if (!transaction) {
      responseHelper.notFound(res, 'Transaction not found or cannot be cancelled');
      return;
    }

    await transaction.cancel(); // ยกเลิกธุรกรรม

    // คืนเงินให้ผู้ส่งถ้าถูกหักไปแล้ว
    const sender = await User.findById(userId) as IUser | null;
    if (sender) {
      await sender.updateWallet(transaction.amount, 'add');
    }

    // แจ้งเตือนทั้งสองฝ่าย
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

    responseHelper.success(res, 'Transaction cancelled successfully'); // ตอบกลับสำเร็จ
  });

  /**
   * ดึงรายการที่รอจ่าย (สำหรับ employer)
   */
  getPendingPayments = catchAsync(async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user!._id; // ผู้ใช้
    const userRole = req.user!.role; // บทบาทผู้ใช้

    let pendingPayments: any[] = [];

    if (userRole === 'employer') {
      // ดึง milestone ที่เสร็จแต่ยังไม่ได้จ่าย
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
      // ดึงธุรกรรมที่ pending สำหรับ worker
      pendingPayments = await Transaction.find({
        to: userId,
        status: 'pending'
      })
      .populate('from', 'name email profilePic')
      .populate('jobId', 'title')
      .populate('milestoneId', 'title') as ITransaction[];
    }

    responseHelper.success(res, SUCCESS_MESSAGES.DATA_RETRIEVED, pendingPayments); // ส่งข้อมูลกลับ
  });
}