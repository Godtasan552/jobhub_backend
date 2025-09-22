import mongoose from 'mongoose';
import dotenv from 'dotenv';

// โหลดค่าตัวแปร environment จาก .env
dotenv.config();

// กำหนด MongoDB URI ใช้ค่า default ถ้า .env ไม่มี
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jobhub';

// Database class ใช้ singleton pattern เพื่อให้มี instance เดียวทั่วระบบ
class Database {
  private static instance: Database;

  // constructor เป็น private ป้องกันการสร้าง instance จากภายนอก
  private constructor() {}

  // คืนค่า instance ของ Database หรือสร้างใหม่ถ้ายังไม่มี
  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  // ฟังก์ชันเชื่อมต่อ MongoDB
  public async connect(): Promise<void> {
    try {
      const options = {
        useNewUrlParser: true,       // ใช้ URL parser ใหม่
        useUnifiedTopology: true,    // ใช้ topology ใหม่ของ MongoDB driver
        maxPoolSize: 10,             // จำนวน connection สูงสุดใน pool
        serverSelectionTimeoutMS: 5000, // timeout สำหรับเลือก server
        socketTimeoutMS: 45000,      // timeout สำหรับ socket
        family: 4,                   // ใช้ IPv4
      };

      // เชื่อมต่อ MongoDB ด้วย Mongoose
      await mongoose.connect(MONGODB_URI, options);
      console.log('✅ MongoDB connected successfully');
      
      // จัดการ event ของ connection
      mongoose.connection.on('error', (error) => {
        // log เมื่อ connection error
        console.error('❌ MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        // log เมื่อ connection ถูกตัด
        console.log('⚠️ MongoDB disconnected');
      });

      mongoose.connection.on('reconnected', () => {
        // log เมื่อ connection reconnect สำเร็จ
        console.log('✅ MongoDB reconnected');
      });

      // จัดการ shutdown ของ process ให้ disconnect DB ก่อนออก
      process.on('SIGINT', async () => {
        await this.disconnect();
        process.exit(0);
      });

    } catch (error) {
      // ถ้า connect ล้มเหลว ให้ log และปิด process
      console.error('❌ MongoDB connection failed:', error);
      process.exit(1);
    }
  }

  // ฟังก์ชันปิด MongoDB connection แบบปลอดภัย
  public async disconnect(): Promise<void> {
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB disconnected gracefully');
    } catch (error) {
      // log error ถ้า disconnect ล้มเหลว
      console.error('❌ Error disconnecting from MongoDB:', error);
    }
  }

  // ฟังก์ชันคืนค่าสถานะ connection ปัจจุบัน
  public getConnectionState(): string {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    return states[mongoose.connection.readyState];
  }

  // ฟังก์ชันเช็คว่าเชื่อมต่ออยู่หรือไม่
  public async isConnected(): Promise<boolean> {
    return mongoose.connection.readyState === 1;
  }
}

// ฟังก์ชันสร้าง indexes ให้ collection ต่าง ๆ เพื่อเพิ่มประสิทธิภาพการค้นหา
const createIndexes = async (): Promise<void> => {
  try {
    // สร้าง index สำหรับ collection users
    await mongoose.connection.collection('users').createIndex({ email: 1 }, { unique: true }); // ป้องกัน email ซ้ำ
    await mongoose.connection.collection('users').createIndex({ role: 1 }); // search ตาม role
    await mongoose.connection.collection('users').createIndex({ skills: 1 }); // search ตาม skills
    await mongoose.connection.collection('users').createIndex({ categories: 1 }); // search ตาม categories

    // สร้าง index สำหรับ collection jobs
    await mongoose.connection.collection('jobs').createIndex({ employerId: 1 }); // search jobs ตาม employer
    await mongoose.connection.collection('jobs').createIndex({ workerId: 1 });   // search jobs ตาม worker
    await mongoose.connection.collection('jobs').createIndex({ category: 1 });   // search jobs ตาม category
    await mongoose.connection.collection('jobs').createIndex({ type: 1 });       // search jobs ตาม type
    await mongoose.connection.collection('jobs').createIndex({ status: 1 });     // search jobs ตาม status
    await mongoose.connection.collection('jobs').createIndex({ budget: 1 });     // sort/filter ตาม budget
    await mongoose.connection.collection('jobs').createIndex({ createdAt: -1 }); // sort jobs ล่าสุด
    await mongoose.connection.collection('jobs').createIndex({ 
      title: 'text', 
      description: 'text' 
    }); // full-text search title + description

    // สร้าง index สำหรับ collection transactions
    await mongoose.connection.collection('transactions').createIndex({ from: 1 });  
    await mongoose.connection.collection('transactions').createIndex({ to: 1 });    
    await mongoose.connection.collection('transactions').createIndex({ status: 1 }); 
    await mongoose.connection.collection('transactions').createIndex({ createdAt: -1 }); 

    // สร้าง index สำหรับ collection messages
    await mongoose.connection.collection('messages').createIndex({ fromUserId: 1 });
    await mongoose.connection.collection('messages').createIndex({ toUserId: 1 });
    await mongoose.connection.collection('messages').createIndex({ jobId: 1 });
    await mongoose.connection.collection('messages').createIndex({ read: 1 });
    await mongoose.connection.collection('messages').createIndex({ createdAt: -1 });

    // สร้าง index สำหรับ collection notifications
    await mongoose.connection.collection('notifications').createIndex({ userId: 1 });
    await mongoose.connection.collection('notifications').createIndex({ read: 1 });
    await mongoose.connection.collection('notifications').createIndex({ type: 1 });
    await mongoose.connection.collection('notifications').createIndex({ createdAt: -1 });

    // สร้าง index สำหรับ collection milestones
    await mongoose.connection.collection('milestones').createIndex({ jobId: 1 });
    await mongoose.connection.collection('milestones').createIndex({ status: 1 });

    // สร้าง index สำหรับ collection jobapplications
    await mongoose.connection.collection('jobapplications').createIndex({ jobId: 1 });
    await mongoose.connection.collection('jobapplications').createIndex({ workerId: 1 });
    await mongoose.connection.collection('jobapplications').createIndex({ status: 1 });

    console.log('✅ Database indexes created successfully');
  } catch (error) {
    // log error ถ้า create index ล้มเหลว
    console.error('❌ Error creating database indexes:', error);
  }
};

// ฟังก์ชันเริ่มต้น database connection และสร้าง indexes
export const initializeDatabase = async (): Promise<void> => {
  const database = Database.getInstance(); // เอา instance ของ Database
  await database.connect();                // เชื่อมต่อ MongoDB
  
  // รอ connection เสถียรสักครู่ก่อนสร้าง indexes
  setTimeout(createIndexes, 2000);
};

// export class Database เพื่อใช้งานใน module อื่น
export default Database;
