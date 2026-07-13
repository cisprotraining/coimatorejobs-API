// middleware/trackCandidateView.js
import CandidateProfile from '../models/candidateProfile.model.js';
import CandidateEmployerActivity from '../models/candidateEmployerActivity.model.js';

const trackCandidateView = async (req, res, next) => {
  try {
    // Only track if viewer is employer
    if (!req.user || req.user.role !== 'employer') return next();

    const profileId = req.params.id;
    if (!profileId) return next();

    const employerId = req.user.id;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const viewedAt = new Date();
    const profile = await CandidateProfile.findById(profileId).select('candidate');

    // Increment total views
    await CandidateProfile.updateOne(
      { _id: profileId },
      { $inc: { profileViews: 1 } }
    );

    // Check if this employer viewed today
    const alreadyViewedToday = await CandidateProfile.exists({
      _id: profileId,
      'uniqueViewers.viewer': employerId,
      'uniqueViewers.lastViewed': { $gte: new Date(today + 'T00:00:00Z') }
    });

    // Update daily view
    const updateResult = await CandidateProfile.updateOne(
      { _id: profileId, 'dailyViews.date': today },
      {
        $inc: {
          'dailyViews.$.count': 1,
          ...(alreadyViewedToday ? {} : { 'dailyViews.$.unique': 1 })
        },
        ...(alreadyViewedToday ? {} : {
          $push: {
            uniqueViewers: {
              viewer: employerId,
              lastViewed: viewedAt
            }
          }
        })
      }
    );

    // If no daily entry exists → create one
    if (updateResult.matchedCount === 0) {
      await CandidateProfile.updateOne(
        { _id: profileId },
        {
          $push: {
            dailyViews: {
              date: today,
              count: 1,
              unique: 1
            },
            uniqueViewers: {
              viewer: employerId,
              lastViewed: viewedAt
            }
          }
        }
      );
    }

    if (profile?.candidate) {
      await CandidateEmployerActivity.updateOne(
        { employer: employerId, candidate: profile.candidate },
        {
          $inc: { profileViewCount: 1 },
          $set: {
            candidateProfile: profile._id,
            lastProfileViewedAt: viewedAt,
            lastActivityAt: viewedAt,
          },
          $setOnInsert: {
            employer: employerId,
            candidate: profile.candidate,
          },
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('Candidate view tracking error:', err);
  }
  next();
};

export default trackCandidateView;
