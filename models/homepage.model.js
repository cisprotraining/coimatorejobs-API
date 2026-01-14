import mongoose from 'mongoose';

const homepageSchema = new mongoose.Schema({
    section_id: { type: String, required: true, unique: true },
    visible: { type: Boolean, default: true },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

const Homepage = mongoose.model('Homepage', homepageSchema);
export default Homepage;