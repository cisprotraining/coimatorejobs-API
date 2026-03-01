import mongoose, { mongo } from "mongoose";    


const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Username is required'],
        trim: true,
        minlength: 3,
        maxlength: 50,
    },
    email: {
        type: String,
        required: [true, 'UserEmail is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    // Flag to indicate if the email is system-generated (for confedential accounts)
    isSystemGeneratedEmail: {
        type: Boolean,
        default: false
    },
    loginId: {
        type: String,
        unique: true,
        sparse: true
    },
    // optional contact email (for employers who want to use their own email instead of system-generated one)
    contactEmail: {
        type: String,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6,
        maxlength: 60,
        trim: true
    },
    role: { 
        type: String, 
        enum: ['candidate', 'employer', 'hr-admin', 'superadmin'], 
        default: 'candidate',
        required: true
    },
    // NEW: Approval status (for candidate and employer roles)
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    // Employer IDs (for HR-Admins to manage employers)
    employerIds: [
        { 
          type: mongoose.Schema.Types.ObjectId, 
          ref: 'User' 
        }
    ],
    candidateIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // when superadmincreating hr-admin or employer, we can track who created whom
    hrAdminIds: [
    {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
    ],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    isActive: { type: Boolean, default: true },
     // password reset
    resetPasswordToken: {
        type: String,
        select: false   // hides it in normal queries
    },
    resetPasswordExpire: {
        type: Date,
        select: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },

    // Soft delete fields
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });


// Indexes for faster queries
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

const userModel = mongoose.model('User', userSchema);

export default userModel;

// name: 'User', email: 'test@gmail.com', password: 'password123', role: 'admin' });