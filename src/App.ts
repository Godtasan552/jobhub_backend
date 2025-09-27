import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import dotenv from 'dotenv';

// Import configurations
import { initializeDatabase } from '@/config/database';
import { SocketService } from '@/config/socket';

// Import middleware
import { globalErrorHandler, notFound, handleUncaughtException, handleUnhandledRejection, setupGracefulShutdown } from '../src/Middleware/errorHandler';

// Import routes
import authRoutes from '../src/routers/auth';
import jobRoutes from '../src/routers/jobs';
import walletRoutes from '../src/routers/wallet';
import chatRoutes from '../src/routers/chat';
import notificationRoutes from '../src/routers/notification';
import adminRoutes from '../src/routers/Admin'; // NEW: Admin routes

// Import constants
import { RATE_LIMITS, API_CONFIG } from '@/utils/constants';
import serveFavicon from 'serve-favicon';
import path from 'path';

// Handle uncaught exceptions
handleUncaughtException();

// Load environment variables
dotenv.config();

class App {
  public app: Application;
  private server: any;
  private socketService: SocketService;

  constructor() {
    this.app = express();
    this.socketService = SocketService.getInstance();
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    this.app.use(serveFavicon(path.join(__dirname, 'public', 'favicon.ico')));
    
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
    }));

    // Compression
    this.app.use(compression());

    // Logging
    if (process.env.NODE_ENV === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined'));
    }

    // Body parsing
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting - Different limits for different routes
    const generalLimiter = rateLimit({
      windowMs: RATE_LIMITS.API.WINDOW_MS,
      max: RATE_LIMITS.API.MAX_REQUESTS,
      message: {
        success: false,
        message: 'Too many requests from this IP, please try again later',
        error: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false
    });

    // Stricter rate limiting for admin routes
    const adminLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Lower limit for admin operations
      message: {
        success: false,
        message: 'Too many admin requests, please try again later',
        error: 'ADMIN_RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false
    });

    this.app.use('/api', generalLimiter);
    this.app.use('/api/*/admin', adminLimiter); // Apply to admin routes

    // Serve static files
    this.app.use('/uploads', express.static('uploads'));

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);
  }

  private initializeRoutes(): void {
    // Health check
    this.app.get('/health', (_req, res) => {
      res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API routes
    const apiRouter = express.Router();
    
    // Public routes
    apiRouter.use('/auth', authRoutes);
    apiRouter.use('/jobs', jobRoutes);
    apiRouter.use('/wallet', walletRoutes);
    apiRouter.use('/chat', chatRoutes);
    apiRouter.use('/notifications', notificationRoutes);
    
    // Admin routes - Protected and separate
    apiRouter.use('/admin', adminRoutes);

    this.app.use(API_CONFIG.BASE_PATH, apiRouter);

    // API documentation route
    this.app.get('/api-docs', (_req, res) => {
      res.json({
        title: 'JobHub API Documentation',
        version: '1.0.0',
        baseUrl: API_CONFIG.BASE_PATH,
        endpoints: {
          // Public endpoints
          auth: `${API_CONFIG.BASE_PATH}/auth`,
          jobs: `${API_CONFIG.BASE_PATH}/jobs`,
          wallet: `${API_CONFIG.BASE_PATH}/wallet`,
          chat: `${API_CONFIG.BASE_PATH}/chat`,
          notifications: `${API_CONFIG.BASE_PATH}/notifications`,
          
          // Admin endpoints
          admin: {
            base: `${API_CONFIG.BASE_PATH}/admin`,
            dashboard: `${API_CONFIG.BASE_PATH}/admin/dashboard`,
            workers: `${API_CONFIG.BASE_PATH}/admin/pending-workers`,
            users: `${API_CONFIG.BASE_PATH}/admin/users`,
            stats: `${API_CONFIG.BASE_PATH}/admin/stats`
          }
        },
        authentication: {
          type: 'Bearer Token',
          header: 'Authorization: Bearer <token>',
          adminAccess: 'Requires admin role in JWT token'
        }
      });
    });

    // Admin status route (for monitoring)
    this.app.get('/admin-status', (_req, res) => {
      res.json({
        success: true,
        message: 'Admin panel is available',
        endpoints: [
          '/api/v1/admin/dashboard',
          '/api/v1/admin/pending-workers',
          '/api/v1/admin/users',
          '/api/v1/admin/stats'
        ],
        authentication: 'Required: Admin role + Bearer token'
      });
    });

    // Root route
    this.app.get('/', (_req, res) => {
      res.json({
        success: true,
        message: 'Welcome to JobHub API',
        version: '1.0.0',
        documentation: '/api-docs',
        health: '/health',
        adminPanel: '/admin-status',
        features: [
          'Multi-role authentication (Employer/Worker/Admin)',
          'Job posting and application system',
          'Real-time chat and notifications',
          'Wallet and payment system',
          'Admin panel for user management'
        ]
      });
    });
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFound);

    // Global error handler
    this.app.use(globalErrorHandler);

    // Handle unhandled promise rejections
    handleUnhandledRejection();
  }

  public async start(): Promise<void> {

    try {
      // Initialize database
      await initializeDatabase();
      console.log('✅ Database initialized');

      // Create HTTP server
      this.server = createServer(this.app);

      // Initialize Socket.IO
      this.socketService.initialize(this.server);
      console.log('✅ Socket.IO initialized');

      // Start server
      const PORT = process.env.PORT || 5000;
      this.server.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
        console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
        console.log(`👑 Admin Panel: http://localhost:${PORT}/admin-status`);
        console.log(`🔗 Admin API: http://localhost:${PORT}/api/v1/admin/*`);
      });

      // Setup graceful shutdown
      setupGracefulShutdown(this.server);

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  public getApp(): Application {
    return this.app;
  }

  public getServer(): any {
    return this.server;
  }
}

// Export app instance
const appInstance = new App();

// Start server if this file is run directly
if (require.main === module) {
  appInstance.start().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}

export default appInstance.getApp();
export { appInstance };