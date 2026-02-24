import mongoose from 'mongoose';
import CompanyProfile from "../models/companyProfile.model.js";
import Industry from '../models/industry.model.js';
import dotenv from 'dotenv';
import connectToDatabase from '../database/mongodb.js';

const migrateIndustry = async () => {
    dotenv.config();
    await connectToDatabase();

  const companies = await CompanyProfile.find({
    industry: { $type: "string" }
  });

  for (const company of companies) {
    const industryDoc = await Industry.findOne({ name: company.industry });

    if (industryDoc) {
      company.industry = industryDoc._id;
      await company.save();
      console.log(`Updated: ${company.companyName}`);
    } else {
      console.log(`Industry not found for: ${company.companyName}`);
    }
  }

  console.log('Migration completed');
  process.exit();
};

migrateIndustry();