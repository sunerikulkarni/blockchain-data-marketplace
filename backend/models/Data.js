// models/Data.js
// Defines the shape of a dataset document stored in MongoDB.

const mongoose = require('mongoose');

const DataSchema = new mongoose.Schema(
  {
    // Human-readable name of the dataset
    name: {
      type: String,
      required: [true, 'Dataset name is required'],
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },

    // One of the predefined categories
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: ['Health', 'Finance', 'Technology', 'Environment', 'Education', 'Research', 'Other'],
        message: '{VALUE} is not a valid category',
      },
    },

    // Full description shown in the marketplace
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },

    // Price in ETH (stored as a string to preserve decimal precision)
    price: {
      type: String,
      required: [true, 'Price is required'],
      validate: {
        validator: (v) => parseFloat(v) > 0,
        message: 'Price must be greater than 0',
      },
    },

    // Ethereum wallet address of the seller (optional until wallet auth is added)
    seller: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    // Whether this listing is currently available for purchase
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },

    // How many times this dataset has been purchased
    sales: {
      type: Number,
      default: 0,
    },
  },
  {
    // Automatically add createdAt and updatedAt timestamps
    timestamps: true,
  }
);

// Index for fast category and name searches
DataSchema.index({ category: 1 });
DataSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Data', DataSchema);
