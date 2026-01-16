import mongoose from 'mongoose';

const homepageSchema = new mongoose.Schema({
    featuredJobs: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'JobPost' // Make sure this matches your Job model name
    }],
    featuredCompanies: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'CompanyProfile' // Make sure this matches your Company model name
    }],
}, { timestamps: true });

const Homepage = mongoose.model('Homepage', homepageSchema);
export default Homepage;