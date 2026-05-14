import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/user.model.js';
import { SUPERADMIN_EMAIL, SUPERADMIN_NAME } from '../config/env.js';

const DEFAULT_SUPERADMIN_PASSWORD = 'admin@123';

const buildNameFromEmail = (email) => {
  const [localPart] = String(email).split('@');
  return localPart || 'superadmin';
};

const getUserReferencePaths = (model) => {
  const scalarPaths = [];
  const arrayPaths = [];

  model.schema.eachPath((pathName, schemaType) => {
    if (pathName === '_id' || pathName === '__v') return;

    const isScalarUserRef =
      schemaType?.instance === 'ObjectID' &&
      schemaType?.options?.ref === 'User';

    const isArrayUserRef =
      schemaType?.instance === 'Array' &&
      schemaType?.caster?.instance === 'ObjectID' &&
      schemaType?.caster?.options?.ref === 'User';

    if (isScalarUserRef) scalarPaths.push(pathName);
    if (isArrayUserRef) arrayPaths.push(pathName);
  });

  return { scalarPaths, arrayPaths };
};

const migrateSuperadminReferences = async ({ sourceIds, targetId }) => {
  if (!sourceIds.length) return;

  const allModels = mongoose.models;
  const sourceObjectIds = sourceIds.map((id) => new mongoose.Types.ObjectId(id));
  const targetObjectId = new mongoose.Types.ObjectId(targetId);

  for (const modelName of Object.keys(allModels)) {
    const model = allModels[modelName];
    const { scalarPaths, arrayPaths } = getUserReferencePaths(model);

    for (const pathName of scalarPaths) {
      await model.updateMany(
        { [pathName]: { $in: sourceObjectIds } },
        { $set: { [pathName]: targetObjectId } }
      );
    }

    for (const pathName of arrayPaths) {
      await model.updateMany(
        { [pathName]: { $in: sourceObjectIds } },
        [
          {
            $set: {
              [pathName]: {
                $setUnion: [
                  {
                    $map: {
                      input: `$${pathName}`,
                      as: 'refId',
                      in: {
                        $cond: [
                          { $in: ['$$refId', sourceObjectIds] },
                          targetObjectId,
                          '$$refId',
                        ],
                      },
                    },
                  },
                  [],
                ],
              },
            },
          },
        ]
      );
    }
  }
};

export const syncSuperadminFromEnv = async () => {
  const targetEmail = String(SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const targetName = String(SUPERADMIN_NAME || '').trim() || buildNameFromEmail(targetEmail);
  if (!targetEmail) {
    console.warn('SUPERADMIN_EMAIL is missing. Skipping superadmin sync.');
    return;
  }

  let existingTargetUser = await User.findOne({ email: targetEmail });

  if (!existingTargetUser) {
    const hashedPassword = await bcrypt.hash(DEFAULT_SUPERADMIN_PASSWORD, 10);
    existingTargetUser = await User.create({
      name: targetName,
      email: targetEmail,
      password: hashedPassword,
      role: 'superadmin',
      isActive: true,
      status: 'approved',
    });
    console.log(`Superadmin created from env: ${targetEmail}`);
  } else {
    if (existingTargetUser.role !== 'superadmin') {
      existingTargetUser.role = 'superadmin';
    }
    if (!existingTargetUser.isActive) {
      existingTargetUser.isActive = true;
    }
    if (existingTargetUser.name !== targetName) {
      existingTargetUser.name = targetName;
    }
    await existingTargetUser.save();
    console.log(`Superadmin ensured from env: ${targetEmail}`);
  }

  const extraSuperadmins = await User.find({
    role: 'superadmin',
    _id: { $ne: existingTargetUser._id },
  }).select('_id email');

  const sourceIds = extraSuperadmins.map((user) => String(user._id));
  if (sourceIds.length) {
    await migrateSuperadminReferences({
      sourceIds,
      targetId: String(existingTargetUser._id),
    });
  }

  const removal = await User.deleteMany({
    role: 'superadmin',
    email: { $ne: targetEmail },
  });

  if (removal.deletedCount > 0) {
    console.log(`Removed ${removal.deletedCount} extra superadmin user(s).`);
  }
};
