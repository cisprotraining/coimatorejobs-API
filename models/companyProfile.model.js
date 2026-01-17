import mongoose from 'mongoose';

const companyProfileSchema = new mongoose.Schema({
  employer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    // unique: true   // Uncomment if each employer can have only one profile
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  companyType: {
    type: String,
    enum: ['Private', 'Public', 'Government', 'Non-profit', 'Startup', 'Other'],
    required: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    minlength: 8,
    maxlength: 20
  },
  website: {
    type: String,
    trim: true,
    match: [/^(https?:\/\/)?([\w\d-]+\.)+[\w\d]{2,}(\/.*)?$/, 'Please enter a valid URL'],
  },
  establishedSince: {
    type: Date,
    required: [true, 'Establishment date is required'],
  },
  teamSize: {
    type: String,
    required: [true, 'Team size is required'],
    enum: ['1 - 10', '10 - 50', '50 - 100', '100 - 150', '200 - 250', '300 - 350', '500 - 1000', '1000+'],
  },
 categories: {
    type: [String],   // Array of strings for categories (ex: ['Tech', 'Finance'])
    required: [true, 'At least one category is required'],
    validate: {   //custom validation to ensure at least one category is provided
      validator: v => Array.isArray(v) && v.length > 0,   // check if it's an array and has at least one element
      message: 'At least one category is required'
    }
  },
  industry: {
    type: String,
    required: [false, 'Industry is required'],
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  allowInSearch: {
    type: Boolean,
    default: true,
  },
  isHiring: {
    type: Boolean,
    default: false,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: 10,
    maxlength: 2000
  },
   // Simple profile views tracking
  profileViews: {
    type: Number,
    default: 0
  },

  // Track daily views for accurate chart
  dailyViews: [
    {
      date: { type: String, required: true }, // 'YYYY-MM-DD'
      count: { type: Number, default: 0 },
      unique: { type: Number, default: 0 } // unique candidates
    }
  ],

  uniqueViewers: [
    {
      candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      lastViewed: { type: Date, default: Date.now }
    }
  ],
  // Approval status from hr-admin or superadmin
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  // Approval status from hr-admin or superadmin
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    default: null
  },
  // timstamp of when the profile was approved
  approvedAt: {
    type: Date,
    default: null
  },
  // rejection reason from hr-admin or superadmin
  rejectionReason: {
    type: String,
    trim: true
  },
  // mission: {
  //   type: String,
  //   trim: true,
  // },
  // vision: {
  //   type: String,
  //   trim: true,
  // },
  culture: [{
    type: String,
    enum: [
      'Remote-first', 'Innovative', 'Diverse', 'Fast-paced',
      'Collaborative', 'Work-life balance', 'Sustainability'
    ],
  }],
  revenue: {
    type: String,
    enum: ['< ₹1M', '₹1M - ₹10M', '₹10M - ₹50M', '₹50M - ₹100M', '₹100M+'],
  },
  founders: [{
    name: { type: String, trim: true },
    role: { type: String, trim: true },
    linkedin: { type: String, trim: true },
  }],
  socialMedia: {
    facebook: { type: String, trim: true },
    twitter: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    instagram: { type: String, trim: true }
  },
  location: {
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true},
    country: { type: String, trim: true },
    zipCode: { type: String, trim: true }
  },
  branches: [{
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },
  }],
  logo: {
    type: String,
    trim: true,
  },
  // coverImage: {
  //   type: String,
  //   trim: true,
  // },
   ratings: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0, min: 0 }
  }
}, { timestamps: true,
      toJSON: {  // Custom toJSON method to remove sensitive fields
        virtuals: true,
        transform: function(doc, ret) {  // Remove fields from the output, (ret)-the raw plain object that will be sent as JSON
          delete ret.__v;
          delete ret.createdAt;
          delete ret.updatedAt;
          return ret;
        }
      }
 });
 
// Indexes for faster queries
companyProfileSchema.index({ 'dailyViews.date': 1 });
// companyProfileSchema.index({ employer: 1 }, { unique: true });  // Uncomment if each employer can have only one profile
companyProfileSchema.index({ companyName: 'text', industry: 'text' });
companyProfileSchema.index({ 'location.city': 1, 'location.country': 1 });
companyProfileSchema.index({ createdBy: 1 });
// companyProfileSchema.index({ employer: 1 });


const CompanyProfile = mongoose.model('CompanyProfile', companyProfileSchema);

export default CompanyProfile;