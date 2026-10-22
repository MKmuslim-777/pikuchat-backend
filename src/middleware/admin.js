export function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== "super_admin") {
    return res.status(403).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Admin access required" },
    });
  }
  next();
}

export default adminMiddleware;
