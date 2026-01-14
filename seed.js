import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Homepage from './models/homepage.model.js';

// Resolve directory path for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load the environment variables from your .env.development.local
dotenv.config({ path: path.join(__dirname, '.env.development.local') });

const seedHomepage = async () => {
  const initialSections = [
    {
      section_id: 'hero',
      visible: true,
      settings: {
        title: "Find Your Dream Job in Coimbatore",
        description: "Connecting local talent with top companies.",
        bgImage: "/images/background/1.jpg"
      }
    },
    {
      section_id: 'featured_jobs',
      visible: true,
      settings: {
        title: "Featured Jobs",
        description: "Know your worth and find the job that qualify your life"
      }
    },
    {
      section_id: 'top_companies',
      visible: true,
      settings: {
        title: "Top Company Registered",
        description: "Some of the companies we have helped recruit over the years."
      }
    },
    {
      section_id: 'how_it_works',
      visible: true,
      settings: {
        title: "Your Path to a Job in Coimbatore"
      }
    },
    {
      section_id: 'testimonials',
      visible: true,
      settings: {
        title: "What people are saying"
      }
    },
    {
      section_id: 'cta_bottom',
      visible: true,
      settings: {
        title: "Your Dream Jobs Are Waiting",
        description: "Over 1 million interactions, 50,000 success stories Make yours now."
      }
    }
  ];

  try {
    // UPDATED: Using DB_URI based on your environment log
    const uri = process.env.DB_URI;

    if (!uri) {
      throw new Error("DB_URI not found in .env.development.local");
    }

    console.log("Connecting to Database...");
    await mongoose.connect(uri);
    console.log("✅ Connected successfully to MongoDB.");

    console.log("Starting seed process...");
    
    // Using for...of loop for reliable async execution
    for (const section of initialSections) {
      await Homepage.findOneAndUpdate(
        { section_id: section.section_id },
        section,
        { upsert: true, new: true }
      );
      console.log(` - Seeded section: ${section.section_id}`);
    }

    console.log("-----------------------------------------");
    console.log("✅ SUCCESSFULLY SEEDED ALL HOMEPAGE SECTIONS");
    console.log("-----------------------------------------");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error.message);
    process.exit(1);
  }
};

// Execute the function
seedHomepage();