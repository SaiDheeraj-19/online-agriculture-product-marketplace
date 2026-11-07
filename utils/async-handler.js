// Wraps async route handlers so rejected promises reach Express' error
// handler instead of crashing the process.
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
