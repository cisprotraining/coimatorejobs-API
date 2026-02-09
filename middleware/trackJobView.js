// middleware/trackJobView.js
import JobPost from '../models/jobs.model.js';

const trackJobView = async (req, res, next) => {
  try {
    // Only track if user is logged in (candidate or employer viewing job)
    if (!req.user) return next();

    // ONLY candidates count as views
    if (req.user.role !== 'candidate') {
      return next();
    }

    const jobId = req.params.id;
    if (!jobId) return next();

    const viewerId = req.user.id;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Increment total views
    await JobPost.updateOne(
      { _id: jobId },
      { $inc: { profileViews: 1 } }
    );

    // Check if this user viewed this job today
    const alreadyViewedToday = await JobPost.exists({
      _id: jobId,
      'uniqueViewers.viewer': viewerId,
      'uniqueViewers.lastViewed': { $gte: new Date(today + 'T00:00:00Z') }
    });

    // Update or create daily view entry
    const updateResult = await JobPost.updateOne(
      { _id: jobId, 'dailyViews.date': today },
      {
        $inc: {
          'dailyViews.$.count': 1,
          ...(alreadyViewedToday ? {} : { 'dailyViews.$.unique': 1 })
        },
        ...(alreadyViewedToday ? {} : {
          $push: {
            uniqueViewers: {
              viewer: viewerId,
              lastViewed: new Date()
            }
          }
        })
      }
    );

    // If no daily entry → create one
    if (updateResult.matchedCount === 0) {
      await JobPost.updateOne(
        { _id: jobId },
        {
          $push: {
            dailyViews: {
              date: today,
              count: 1,
              unique: 1
            },
            uniqueViewers: {
              viewer: viewerId,
              lastViewed: new Date()
            }
          }
        }
      );
    }
  } catch (err) {
    console.error('Job view tracking error:', err.message);
  }

  next();
};

export default trackJobView;