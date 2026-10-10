import type { Request, Response, NextFunction } from "express";

export function authMiddleware(authToken: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!authToken) {
      next();
      return;
    }
    if (req.path === "/health" || req.path === "/api/health") {
      next();
      return;
    }
    const header = req.header("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match || match[1] !== authToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}
