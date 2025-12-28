
import mongoose from "mongoose";
import { DB_URI, NODE_ENV } from "../config/env.js";

if(!DB_URI) {
  throw new Error("DB_URI is not defined in environment variables or .env<development/production>.local file.");
}

const connectToDatabase = async () => {
    try {
        // await mongoose.connect(DB_URI, {
        //     useNewUrlParser: true,
        //     useUnifiedTopology: true,
        // });
        await mongoose.connect(DB_URI);
        console.log(`Connected to ${NODE_ENV} env MongoDB successfully!!`);
    }catch (error) {
        console.error("Error connecting to MongoDB:", error);
        process.exit(1); // Exit the process with failure
    }
}

export default connectToDatabase;