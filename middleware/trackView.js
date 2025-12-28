/**
 * Safely tracks company profile views by candidates
 * - Increments total profileViews
 * - Ensures dailyViews array exists
 * - Creates or updates today's entry with count & unique
 * - Prevents duplicate unique counts per candidate per day
 */
import CompanyProfile from '../models/companyProfile.model.js';

const trackView = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'candidate') return next();

    const profileId = req.params.id;
    if (!profileId) return next();

    const candidateId = req.user.id;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    //  Increment total profile views
    await CompanyProfile.updateOne(
      { _id: profileId },
      { $inc: { profileViews: 1 } }
    );

    // Check if candidate already viewed today
    const alreadyViewedToday = await CompanyProfile.exists({
      _id: profileId,
      uniqueViewers: {
        $elemMatch: {
          candidate: candidateId,
          lastViewed: {
            $gte: new Date(today),
          },
        },
      },
    });

    // Update dailyViews
    const dailyViewExists = await CompanyProfile.exists({
      _id: profileId,
      'dailyViews.date': today,
    });

    if (!dailyViewExists) {
      // First view today
      await CompanyProfile.updateOne(
        { _id: profileId },
        {
          $push: {
            dailyViews: {
              date: today,
              count: 1,
              unique: alreadyViewedToday ? 0 : 1,
            },
            ...(alreadyViewedToday
              ? {}
              : {
                  uniqueViewers: {
                    candidate: candidateId,
                    lastViewed: new Date(),
                  },
                }),
          },
        }
      );
    } else {
      // Today exists → increment count
      await CompanyProfile.updateOne(
        { _id: profileId, 'dailyViews.date': today },
        {
          $inc: {
            'dailyViews.$.count': 1,
            ...(alreadyViewedToday ? {} : { 'dailyViews.$.unique': 1 }),
          },
          ...(alreadyViewedToday
            ? {}
            : {
                $push: {
                  uniqueViewers: {
                    candidate: candidateId,
                    lastViewed: new Date(),
                  },
                },
              }),
        }
      );
    }

  } catch (err) {
    console.error('View tracking error:', err.message);
  }

  next();
};

export default trackView;
