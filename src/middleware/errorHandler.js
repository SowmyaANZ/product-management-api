const createResponse = (success, data = null, error = null) => ({
  success,
  data,
  error
});

export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  if (err.errors && Array.isArray(err.errors)) {
    return res.status(err.statusCode || 400).json(
      createResponse(false, null, {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.errors
      })
    );
  }

  if (err.statusCode === 409) {
    return res.status(409).json(
      createResponse(false, null, {
        message: err.message,
        code: 'CONFLICT'
      })
    );
  }

  if (err.name === 'SyntaxError' && err.status === 400 && 'body' in err) {
    return res.status(400).json(
      createResponse(false, null, {
        message: 'Invalid JSON payload',
        code: 'INVALID_JSON'
      })
    );
  }

  return res.status(500).json(
    createResponse(false, null, {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    })
  );
};

export const notFoundHandler = (req, res) => {
  res.status(404).json(
    createResponse(false, null, {
      message: 'Route not found',
      code: 'NOT_FOUND'
    })
  );
};