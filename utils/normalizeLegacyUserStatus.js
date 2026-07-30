import User from "../models/user.model.js";

const legacySelfSignupFilter = {
  role: { $in: ["candidate", "employer"] },
  status: "pending",
  isActive: true,
  $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
  $and: [
    {
      $or: [
        { assignmentSource: "self-signup" },
        { assignmentSource: { $exists: false } },
        { assignmentSource: null },
      ],
    },
    {
      $or: [
        { createdBy: { $exists: false } },
        { createdBy: null },
      ],
    },
  ],
};

export const approveLegacySelfSignupUsers = async () => {
  try {
    const result = await User.updateMany(
      legacySelfSignupFilter,
      {
        $set: {
          status: "approved",
          assignmentSource: "self-signup",
        },
      }
    );

    const modifiedCount = result.modifiedCount || 0;
    if (modifiedCount > 0) {
      console.log(`Approved ${modifiedCount} legacy self-signup user account(s).`);
    }
  } catch (error) {
    console.error("Failed to approve legacy self-signup users:", error);
  }
};
