// models/Company.js
// Stores registered data-consumer/company information
// and its verification status.

const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema(
  {
    // Name of the company
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: [150, 'Company name cannot exceed 150 characters'],
    },

    // Official company email
    email: {
  type: String,
  required: [true, 'Company email is required'],
  trim: true,
  lowercase: true,
  match: [
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    'Please provide a valid email address',
  ],
},

    // Company registration / identification number
    registrationNumber: {
      type: String,
      required: [true, 'Company registration number is required'],
      trim: true,
      maxlength: [100, 'Registration number cannot exceed 100 characters'],
    },

    // Ethereum wallet belonging to the company
    walletAddress: {
      type: String,
      required: [true, 'Company wallet address is required'],
      trim: true,
      lowercase: true,
      match: [
        /^0x[a-fA-F0-9]{40}$/,
        'Invalid Ethereum wallet address',
      ],
    },

    // Optional description about the company
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },

    // Verification state
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },

    // Optional reason when admin rejects a company
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },

    // Time when verification was completed
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate wallet registrations
CompanySchema.index({ walletAddress: 1 }, { unique: true });

// Prevent duplicate company registration numbers
CompanySchema.index(
  { registrationNumber: 1 },
  { unique: true }
);

// Make searching pending companies faster
CompanySchema.index({ verificationStatus: 1 });

module.exports = mongoose.model('Company', CompanySchema);