import User from '../Models/User'; // นำเข้าโมเดล User สำหรับใช้งานข้อมูลผู้ใช้
import Transaction from '../Models/Transaction'; // นำเข้าโมเดล Transaction สำหรับบันทึกธุรกรรม
import Job from '../Models/Job'; // นำเข้าโมเดล Job สำหรับใช้งานข้อมูลงาน
import Milestone from '../Models/Milestone'; // นำเข้าโมเดล Milestone สำหรับใช้งานข้อมูล milestone
import Notification from '../Models/Nontification'; // นำเข้าโมเดล Notification สำหรับแจ้งเตือน
import { SocketService } from '@/config/socket'; // นำเข้า service สำหรับ socket เพื่อแจ้งเตือนแบบ real-time
import { MOCK_PAYMENT_CONFIG, ERROR_MESSAGES } from '@/utils/constants'; // นำเข้าค่าคงที่ที่ใช้ในระบบ
import { IUser, IJob, IMilestone, ITransaction, INotificationModel } from '@/types/index'; // นำเข้า type ที่เกี่ยวข้อง

// กำหนด interface สำหรับข้อมูลที่ใช้ในการจ่ายเงินทั่วไป
export interface PaymentRequest {
  from: string; // id ผู้จ่าย
  to: string; // id ผู้รับ
  amount: number; // จำนวนเงิน
  type: 'job_payment' | 'milestone_payment' | 'payroll' | 'refund' | 'bonus'; // ประเภทการจ่าย
  description?: string; // รายละเอียดเพิ่มเติม
  jobId?: string; // id งาน (ถ้ามี)
  milestoneId?: string; // id milestone (ถ้ามี)
}

// interface สำหรับการจ่ายเงินงาน
export interface JobPaymentRequest {
  jobId: string; // id งาน
  employerId: string; // id ผู้จ้าง
  workerId: string; // id ผู้รับงาน
  amount: number; // จำนวนเงิน
  description?: string; // รายละเอียดเพิ่มเติม
}

// interface สำหรับการจ่าย milestone
export interface MilestonePaymentRequest {
  milestoneId: string; // id milestone
  employerId: string; // id ผู้จ้าง
  workerId: string; // id ผู้รับ milestone
  amount: number; // จำนวนเงิน
  description?: string; // รายละเอียดเพิ่มเติม
}

// คลาสหลักสำหรับจัดการกระเป๋าเงิน
export class WalletService {
  private socketService = SocketService.getInstance(); // สร้าง instance สำหรับ socket service

  /**
   * ฟังก์ชันสำหรับจ่ายเงินทั่วไประหว่างผู้ใช้
   */
  async processPayment(request: PaymentRequest): Promise<ITransaction> {
    const { from, to, amount, type, description, jobId, milestoneId } = request; // ดึงข้อมูลจาก request

    // ตรวจสอบความถูกต้องของ request
    await this.validatePaymentRequest(request);

    // ค้นหาผู้จ่ายและผู้รับ
    const sender = await User.findById(from) as IUser | null;
    const receiver = await User.findById(to) as IUser | null;

    if (!sender || !receiver) {
      throw new Error('Invalid sender or receiver'); // ถ้าไม่เจอผู้ใช้
    }

    if (!sender.isActive || !receiver.isActive) {
      throw new Error('Inactive user account'); // ถ้าบัญชีถูกปิดใช้งาน
    }

    // ตรวจสอบยอดเงินในกระเป๋า
    if (sender.wallet < amount) {
      throw new Error(ERROR_MESSAGES.INSUFFICIENT_BALANCE); // ถ้ายอดเงินไม่พอ
    }

    // สร้างธุรกรรมใหม่
    const transaction = await Transaction.create({
      type,
      from,
      to,
      amount,
      status: 'pending',
      description,
      jobId,
      milestoneId
    }) as ITransaction;

    try {
      // จำลองการประมวลผลการจ่ายเงิน
      const paymentResult = await this.simulatePaymentProcessing(amount);
      
      if (paymentResult.success) {
        // หักเงินจากผู้จ่าย
        await sender.updateWallet(amount, 'subtract');
        
        // เติมเงินให้ผู้รับ
        await receiver.updateWallet(amount, 'add');
        
        // อัพเดทสถานะธุรกรรม
        await transaction.complete();

        // ส่งแจ้งเตือน
        await this.sendPaymentNotifications(transaction, sender, receiver);

        return transaction; // ส่งคืนธุรกรรมที่สำเร็จ
      } else {
        // ถ้าการจ่ายเงินล้มเหลว
        await transaction.fail(paymentResult.reason || 'Payment processing failed');
        throw new Error(`Payment failed: ${paymentResult.reason}`);
      }
    } catch (error) {
      // กรณีเกิดข้อผิดพลาดระหว่างจ่ายเงิน
      await transaction.fail((error as Error).message);
      throw error;
    }
  }

  /**
   * ฟังก์ชันสำหรับจ่ายเงินให้กับงาน
   */
  async processJobPayment(request: JobPaymentRequest): Promise<ITransaction> {
    const { jobId, employerId, workerId, amount, description } = request; // ดึงข้อมูลจาก request

    // ตรวจสอบงาน
    const job = await Job.findOne({ _id: jobId, employerId }) as IJob | null;
    if (!job) {
      throw new Error('Job not found or access denied'); // ถ้าไม่เจองานหรือไม่ใช่เจ้าของ
    }

    if (job.workerId?.toString() !== workerId) {
      throw new Error('Worker not assigned to this job'); // ถ้า worker ไม่ตรง
    }

    // เตรียมข้อมูลสำหรับจ่ายเงิน
    const paymentRequest: PaymentRequest = {
      from: employerId,
      to: workerId,
      amount,
      type: 'job_payment',
      description: description || `Payment for job: ${job.title}`,
      jobId
    };

    const transaction = await this.processPayment(paymentRequest); // ดำเนินการจ่ายเงิน

    // ส่งแจ้งเตือนเฉพาะงาน
    await (Notification as INotificationModel).createJobNotification(
      workerId,
      jobId,
      'Job Payment Received',
      `You received $${amount} for "${job.title}"`,
      `/jobs/${jobId}`
    );

    // ส่งแจ้งเตือนแบบ real-time ถ้ามี method นี้
    if (typeof this.socketService.sendJobUpdateNotification === 'function') {
      this.socketService.sendJobUpdateNotification(
        workerId,
        jobId,
        'payment_received',
        `Payment of $${amount} received`
      );
    }

    return transaction; // ส่งคืนธุรกรรม
  }

  /**
   * ฟังก์ชันสำหรับจ่ายเงิน milestone
   */
  async processMilestonePayment(request: MilestonePaymentRequest): Promise<ITransaction> {
    const { milestoneId, employerId, workerId, amount, description } = request; // ดึงข้อมูลจาก request

    // ตรวจสอบ milestone
    const milestone = await Milestone.findById(milestoneId).populate('jobId') as IMilestone | null;
    if (!milestone) {
      throw new Error('Milestone not found'); // ถ้าไม่เจอ milestone
    }

    const job = milestone.jobId as any; // job ที่ถูก populate
    if (job.employerId.toString() !== employerId) {
      throw new Error('Access denied'); // ถ้าไม่ใช่เจ้าของงาน
    }

    if (milestone.status !== 'completed') {
      throw new Error('Milestone must be completed before payment'); // milestone ต้องเสร็จก่อน
    }

    if (milestone.amount !== amount) {
      throw new Error('Payment amount does not match milestone amount'); // จำนวนเงินต้องตรงกับ milestone
    }

    // เตรียมข้อมูลสำหรับจ่ายเงิน
    const paymentRequest: PaymentRequest = {
      from: employerId,
      to: workerId,
      amount,
      type: 'milestone_payment',
      description: description || `Milestone payment: ${milestone.title}`,
      jobId: job._id,
      milestoneId
    };

    const transaction = await this.processPayment(paymentRequest); // ดำเนินการจ่ายเงิน

    // อัพเดทสถานะ milestone
    await milestone.markPaid();

    // ส่งแจ้งเตือนเฉพาะ milestone
    await (Notification as INotificationModel).createMilestoneNotification(
      workerId,
      milestoneId,
      'Milestone Payment Received',
      `You received $${amount} for milestone "${milestone.title}"`,
      `/jobs/${job._id}/milestones`
    );

    // ส่งแจ้งเตือนแบบ real-time ถ้ามี method นี้
    if (typeof this.socketService.sendMilestoneUpdateNotification === 'function') {
      this.socketService.sendMilestoneUpdateNotification(
        workerId,
        milestoneId,
        'paid',
        amount
      );
    }

    return transaction; // ส่งคืนธุรกรรม
  }

  /**
   * ฟังก์ชันสำหรับคืนเงิน (refund)
   */
  async processRefund(transactionId: string, reason?: string): Promise<ITransaction> {
    const originalTransaction = await Transaction.findById(transactionId) as ITransaction | null;
    if (!originalTransaction) {
      throw new Error('Original transaction not found'); // ถ้าไม่เจอธุรกรรมเดิม
    }

    if (originalTransaction.status !== 'completed') {
      throw new Error('Can only refund completed transactions'); // คืนเงินได้เฉพาะธุรกรรมที่สำเร็จ
    }

    // สร้างธุรกรรม refund
    const refundRequest: PaymentRequest = {
      from: originalTransaction.to.toString(),
      to: originalTransaction.from.toString(),
      amount: originalTransaction.amount,
      type: 'refund',
      description: `Refund for transaction ${transactionId}${reason ? ` - ${reason}` : ''}`
    };

    const refundTransaction = await this.processPayment(refundRequest); // ดำเนินการคืนเงิน

    // อัพเดทสถานะธุรกรรมเดิม
    originalTransaction.status = 'cancelled';
    await originalTransaction.save();

    return refundTransaction; // ส่งคืนธุรกรรม refund
  }

  /**
   * ฟังก์ชันสำหรับดูยอดเงินในกระเป๋า
   */
  async getWalletBalance(userId: string): Promise<number> {
    const user = await User.findById(userId) as IUser | null; // ค้นหาผู้ใช้
    return user?.wallet || 0; // คืนยอดเงิน ถ้าไม่เจอคืน 0
  }

  /**
   * ฟังก์ชันสำหรับคำนวณยอดเงิน escrow ของงาน
   */
  async calculateEscrowAmount(jobId: string): Promise<number> {
    const job = await Job.findById(jobId) as IJob | null; // ค้นหางาน
    if (!job) {
      throw new Error('Job not found'); // ถ้าไม่เจองาน
    }

    let totalAmount = 0; // ตัวแปรเก็บยอดรวม

    switch (job.type) {
      case 'freelance':
        totalAmount = job.budget; // freelance ใช้งบตรง
        break;
      case 'contract':
        // contract รวมยอด milestone ทั้งหมด
        const milestones = await Milestone.find({ jobId }) as IMilestone[];
        totalAmount = milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
        break;
      case 'part-time':
      case 'full-time':
        // อาจจะเป็นรายชั่วโมงหรือยอดรวม
        totalAmount = job.budget;
        break;
      default:
        totalAmount = job.budget;
    }

    return totalAmount; // คืนยอดรวม
  }

  /**
   * ฟังก์ชันสำหรับ hold เงิน escrow
   */
  async holdEscrow(employerId: string, jobId: string): Promise<{
    transaction: ITransaction;
    escrowAmount: number;
    newBalance: number;
  }> {
    const escrowAmount = await this.calculateEscrowAmount(jobId); // คำนวณยอด escrow
    
    const employer = await User.findById(employerId) as IUser | null; // ค้นหาผู้จ้าง
    if (!employer || employer.wallet < escrowAmount) {
      throw new Error(ERROR_MESSAGES.INSUFFICIENT_BALANCE); // ถ้ายอดเงินไม่พอ
    }

    // สร้างธุรกรรม escrow
    const transaction = await Transaction.create({
      type: 'job_payment',
      from: employerId,
      to: employerId, // เงินอยู่กับตัวเอง (hold)
      amount: escrowAmount,
      status: 'pending',
      description: `Escrow hold for job ${jobId}`,
      jobId
    }) as ITransaction;

    // หักเงินออกจากกระเป๋า (แต่ยังไม่โอนไปไหน)
    await employer.updateWallet(escrowAmount, 'subtract');

    return {
      transaction,
      escrowAmount,
      newBalance: employer.wallet
    };
  }

  /**
   * ฟังก์ชันสำหรับปล่อยเงิน escrow
   */
  async releaseEscrow(transactionId: string, toUserId: string): Promise<ITransaction> {
    const escrowTransaction = await Transaction.findById(transactionId) as ITransaction | null;
    if (!escrowTransaction) {
      throw new Error('Escrow transaction not found'); // ถ้าไม่เจอธุรกรรม
    }

    if (escrowTransaction.status !== 'pending') {
      throw new Error('Escrow already processed'); // ถ้า escrow ถูกปล่อยแล้ว
    }

    // เติมเงินให้ผู้รับ
    const recipient = await User.findById(toUserId) as IUser | null;
    if (!recipient) {
      throw new Error('Recipient not found'); // ถ้าไม่เจอผู้รับ
    }

    await recipient.updateWallet(escrowTransaction.amount, 'add');

    // อัพเดทธุรกรรม
    escrowTransaction.to = toUserId as any;
    await escrowTransaction.complete();

    return escrowTransaction; // ส่งคืนธุรกรรม
  }

  /**
   * ฟังก์ชันจำลองการประมวลผลการจ่ายเงิน (mock)
   */
  private async simulatePaymentProcessing(amount: number): Promise<{
    success: boolean;
    reason?: string;
  }> {
    // จำลองดีเลย์การประมวลผล
    await new Promise(resolve => setTimeout(resolve, MOCK_PAYMENT_CONFIG.PROCESSING_TIME_MS));

    // จำลองความสำเร็จ/ล้มเหลว
    const isSuccessful = Math.random() < MOCK_PAYMENT_CONFIG.SUCCESS_RATE;
    
    if (isSuccessful) {
      return { success: true };
    } else {
      const reason = MOCK_PAYMENT_CONFIG.FAILURE_REASONS[
        Math.floor(Math.random() * MOCK_PAYMENT_CONFIG.FAILURE_REASONS.length)
      ];
      return { success: false, reason };
    }
  }

  /**
   * ฟังก์ชันสำหรับส่งแจ้งเตือนการจ่ายเงิน
   */
  private async sendPaymentNotifications(
    transaction: ITransaction,
    sender: IUser,
    receiver: IUser
  ): Promise<void> {
    // แจ้งเตือนผู้จ่าย
    await (Notification as INotificationModel).createPaymentNotification(
      sender._id,
      transaction._id,
      'Payment Sent',
      `You sent $${transaction.amount} to ${receiver.name}`,
      `/wallet/transactions/${transaction._id}`
    );

    // แจ้งเตือนผู้รับ
    await (Notification as INotificationModel).createPaymentNotification(
      receiver._id,
      transaction._id,
      'Payment Received',
      `You received $${transaction.amount} from ${sender.name}`,
      `/wallet/transactions/${transaction._id}`
    );

    // แจ้งเตือนแบบ real-time ถ้ามี method นี้
    if (typeof this.socketService.sendPaymentNotification === 'function') {
      this.socketService.sendPaymentNotification(
        sender._id.toString(),
        transaction.amount,
        'sent',
        transaction._id
      );

      this.socketService.sendPaymentNotification(
        receiver._id.toString(),
        transaction.amount,
        'received',
        transaction._id
      );
    }
  }

  /**
   * ฟังก์ชันสำหรับคำนวณค่าธรรมเนียมธุรกรรม
   */
  calculateTransactionFee(amount: number, type: string): number {
    // คิดค่าธรรมเนียมตามประเภท
    switch (type) {
      case 'job_payment':
      case 'milestone_payment':
        return amount * 0.029; // 2.9%
      case 'bonus':
        return amount * 0.015; // 1.5%
      case 'refund':
        return 0; // คืนเงินไม่คิดค่าธรรมเนียม
      default:
        return 0;
    }
  }

  /**
   * ฟังก์ชันสำหรับตรวจสอบความถูกต้องของ request การจ่ายเงิน
   */
  private async validatePaymentRequest(request: PaymentRequest): Promise<void> {
    if (request.amount <= 0) {
      throw new Error('Amount must be greater than 0'); // จำนวนเงินต้องมากกว่า 0
    }

    if (request.from === request.to) {
      throw new Error('Cannot send payment to yourself'); // ห้ามโอนเงินให้ตัวเอง
    }

    // ตรวจสอบเพิ่มเติมตามประเภท
    switch (request.type) {
      case 'job_payment':
        if (!request.jobId) {
          throw new Error('Job ID is required for job payments'); // ต้องมี jobId
        }
        break;
      case 'milestone_payment':
        if (!request.milestoneId) {
          throw new Error('Milestone ID is required for milestone payments'); // ต้องมี milestoneId
        }
        break;
    }
  }
}