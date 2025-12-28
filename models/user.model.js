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
    password: {
        type: String,
        required: true,
        minlength: 6,
        maxlength: 60,
        trim: true
    },
    role: { 
        type: String, 
        enum: ['candidate', 'employer', 'admin', 'superadmin'], 
        default: 'candidate' 
    },
    isActive: { type: Boolean, default: true },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });


// Indexes for faster queries
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

const userModel = mongoose.model('User', userSchema);

export default userModel;

// name: 'User', email: 'test@gmail.com', password: 'password123', role: 'admin' });