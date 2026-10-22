/** Errors carry a stable code the front end translates; message is for logs and developers. */
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (code, message, details) => new AppError(400, code, message, details);
const unauthorized = (code = 'UNAUTHENTICATED', message = 'Sign in required') => new AppError(401, code, message);
const forbidden = (code = 'FORBIDDEN', message = 'Not allowed') => new AppError(403, code, message);
const notFound = (code = 'NOT_FOUND', message = 'Not found') => new AppError(404, code, message);
const conflict = (code, message, details) => new AppError(409, code, message, details);
const unprocessable = (code, message, details) => new AppError(422, code, message, details);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable };
