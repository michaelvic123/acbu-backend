import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { processBulkTransfer } from "../services/enterpriseService";

function getUploadedFile(
  req: Request,
):
  | { buffer: Buffer; originalname?: string; mimetype?: string; size?: number }
  | undefined {
  const anyReq = req as Request & {
    file?: {
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    };
    files?: Array<{
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    }>;
  };

  const file = anyReq.file ?? anyReq.files?.[0];
  if (!file?.buffer) {
    return undefined;
  }

  return file as { buffer: Buffer; originalname?: string; mimetype?: string; size?: number };
}

function isCsvUpload(file: {
  originalname?: string;
  mimetype?: string;
}): boolean {
  const name = file.originalname?.toLowerCase() ?? "";
  const mimetype = file.mimetype?.toLowerCase() ?? "";
  return (
    mimetype.includes("text/csv") ||
    mimetype.includes("text/plain") ||
    name.endsWith(".csv")
  );
}

/**
 * POST /enterprise/bulk-transfer
 * Process a bulk CSV transfer upload for an enterprise organization.
 */
export async function postBulkTransfer(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId = req.apiKey?.organizationId;
    const userId = req.apiKey?.userId;

    if (!organizationId || !userId) {
      throw new AppError("Enterprise authentication required", 401);
    }

    const uploadedFile = getUploadedFile(req);
    if (!uploadedFile?.buffer) {
      throw new AppError("CSV file upload is required", 400);
    }

    if (!isCsvUpload(uploadedFile)) {
      throw new AppError("Uploaded file must be a CSV", 400);
    }

    const result = await processBulkTransfer({
      organizationId,
      senderUserId: userId,
      fileContent: uploadedFile.buffer,
      fileName: uploadedFile.originalname,
    });

    res.status(200).json({
      job_id: result.jobId,
      status: result.status,
      message: "Bulk transfer processed successfully.",
      success_count: result.successCount,
      failure_count: result.failureCount,
      skipped_count: result.skippedCount,
      failure_report: result.failureReport,
      result,
    });
  } catch (e) {
    if (e instanceof AppError) {
      return next(e);
    }
    next(e);
  }
}

/**
 * GET /enterprise/treasury
 * Returns a stub treasury response until treasury aggregation is implemented.
 */
export async function getTreasury(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.status(200).json({
      totalBalance: null,
      byCurrency: [],
      message: "Treasury view not yet implemented.",
    });
  } catch (e) {
    next(e);
  }
}
