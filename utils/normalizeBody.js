//old
// middleware/normalizeBody.js
import { BadRequestError } from './errors.js';

// const normalizeBody = (req, res, next) => {
//   try {
//     console.log('Request Content-Type:', req.get('Content-Type'));
//     console.log('Raw req.body:', req.body);

//     // Handle FormData (multipart/form-data)
//     if (req.is('multipart/form-data')) {
//       if (!req.body) {
//         throw new BadRequestError('Request body is empty');
//       }
//       if (req.body.data) {
//         try {
//           req.body = { ...req.body, ...JSON.parse(req.body.data) };
//           delete req.body.data;
//         } catch (err) {
//           throw new BadRequestError('Invalid JSON in "data" field');
//         }
//       } else {
//         throw new BadRequestError('Missing "data" field in FormData');
//       }
//     } else if (req.is('application/json')) {
//       if (!req.body) {
//         throw new BadRequestError('Request body is empty');
//       }
//       // JSON payload is already parsed by express.json()
//     } else {
//       throw new BadRequestError('Unsupported Content-Type. Use multipart/form-data or application/json');
//     }

//     console.log('Normalized req.body:', req.body);
//     next();
//   } catch (error) {
//     next(error);
//   }
// };

const normalizeBody = (req, res, next) => {
  try {
    // console.log('Request Content-Type:', req.get('Content-Type'));
    // console.log('Raw req.body:', req.body);

    // Handle FormData (multipart/form-data)
    if (req.is('multipart/form-data')) {
      if (!req.body || Object.keys(req.body).length === 0) {
        throw new BadRequestError('Request body is empty');
      }
      // If 'data' field exists, parse it as JSON
      if (req.body.data) {
        try {
          req.body = { ...req.body, ...JSON.parse(req.body.data) };
          delete req.body.data;
        } catch (err) {
          throw new BadRequestError('Invalid JSON in "data" field');
        }
      }
      // If no 'data' field, use req.body as is (direct form-data fields)
    } else if (req.is('application/json')) {
      if (!req.body || Object.keys(req.body).length === 0) {
        throw new BadRequestError('Request body is empty');
      }
      // JSON payload is already parsed by express.json()
    } else {
      throw new BadRequestError('Unsupported Content-Type. Use multipart/form-data or application/json');
    }

    // console.log('Normalized req.body:', req.body);
    next();
  } catch (error) {
    next(error);
  }
};

export default normalizeBody;