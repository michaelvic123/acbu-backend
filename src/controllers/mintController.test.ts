/**
 * Integration tests for mintController.depositFromBasketCurrency
 * Tests currency conversion before deposit limit checking
 */

import {
  depositFromBasketCurrency,
} from "./mintController";
import { prisma } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import type { AuthRequest } from "../middleware/auth";
import type { Response, NextFunction } from "express";
import { Decimal } from "@prisma/client/runtime/library";
import * as limitsService from "../services/limits/limitsService";
import * as converter from "../services/rates/currencyConverter";

// Mock dependencies
jest.mock("../config/database");
jest.mock("../services/audit", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../services/limits/limitsService");
jest.mock("../services/rates/currencyConverter");
jest.mock("../config/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  (res.json as jest.Mock).mockReturnValue(res);
  return res;
};

const makeNext = () => jest.fn() as jest.MockedFunction<NextFunction>;

const makeAuthRequest = (overrides: Partial<AuthRequest> = {}): AuthRequest => {
  const req: AuthRequest = {
    apiKey: {
      userId: "test-user-1",
      organizationId: null,
    },
    audience: "retail",
    body: {
      currency: "NGN",
      amount: "100000",
      wallet_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    },
    ...overrides,
  } as AuthRequest;
  return req;
};

describe("mintController.depositFromBasketCurrency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Currency Conversion Before Limit Check", () => {
    it("should convert NGN to USD before checking limits", async () => {
      // Setup: mocks
      const mockCheckDepositLimits = jest.mocked(limitsService.checkDepositLimits);
      const mockConvertLocalToUsd = jest.mocked(converter.convertLocalToUsd);
      const mockIsMintingPaused = jest.mocked(limitsService.isMintingPaused);
      const mockTransaction = { id: "tx-1" };

      // Mock rates (1 ACBU = 1000 NGN, 1 ACBU = $0.50)
      // So 100,000 NGN = 100 ACBU = $50 USD
      mockConvertLocalToUsd.mockResolvedValue(50);
      mockIsMintingPaused.mockResolvedValue(false);
      mockCheckDepositLimits.mockResolvedValue(undefined);

      // Mock database
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "test-user-1",
        stellarAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      });
      (prisma.transaction.create as jest.Mock).mockResolvedValue(mockTransaction);

      // Execute
      const req = makeAuthRequest({
        body: {
          currency: "NGN",
          amount: "100000",
          wallet_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        },
      });
      const res = makeRes();
      const next = makeNext();

      await depositFromBasketCurrency(req, res, next);

      // Verify: converter was called with correct parameters
      expect(mockConvertLocalToUsd).toHaveBeenCalledWith(100000, "NGN");

      // Verify: checkDepositLimits was called with USD value, not raw NGN
      expect(mockCheckDepositLimits).toHaveBeenCalledWith(
        "retail",
        50, // USD value, not 100000 NGN
        "test-user-1",
        null,
      );

      // Verify: response is correct
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction_id: "tx-1",
          currency: "NGN",
          amount: "100000",
          status: "pending",
        }),
      );
    });

    it("should convert KES to USD before checking limits", async () => {
      const mockCheckDepositLimits = jest.mocked(limitsService.checkDepositLimits);
      const mockConvertLocalToUsd = jest.mocked(converter.convertLocalToUsd);
      const mockIsMintingPaused = jest.mocked(limitsService.isMintingPaused);
      const mockTransaction = { id: "tx-2" };

      // Mock rates (1 ACBU = 150 KES, 1 ACBU = $0.50)
      // So 7,500 KES = 50 ACBU = $25 USD
      mockConvertLocalToUsd.mockResolvedValue(25);
      mockIsMintingPaused.mockResolvedValue(false);
      mockCheckDepositLimits.mockResolvedValue(undefined);

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "test-user-1",
        stellarAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      });
      (prisma.transaction.create as jest.Mock).mockResolvedValue(mockTransaction);

      const req = makeAuthRequest({
        body: {
          currency: "KES",
          amount: "7500",
          wallet_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        },
      });
      const res = makeRes();
      const next = makeNext();

      await depositFromBasketCurrency(req, res, next);

      // Verify: converter was called with KES
      expect(mockConvertLocalToUsd).toHaveBeenCalledWith(7500, "KES");

      // Verify: limits check received USD value
      expect(mockCheckDepositLimits).toHaveBeenCalledWith(
        "retail",
        25, // USD value
        "test-user-1",
        null,
      );

      expect(res.status).toHaveBeenCalledWith(202);
    });

    it("should use business audience when set", async () => {
      const mockCheckDepositLimits = jest.mocked(limitsService.checkDepositLimits);
      const mockConvertLocalToUsd = jest.mocked(converter.convertLocalToUsd);
      const mockIsMintingPaused = jest.mocked(limitsService.isMintingPaused);
      const mockTransaction = { id: "tx-3" };

      mockConvertLocalToUsd.mockResolvedValue(100);
      mockIsMintingPaused.mockResolvedValue(false);
      mockCheckDepositLimits.mockResolvedValue(undefined);

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "org-user-1",
        stellarAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      });
      (prisma.transaction.create as jest.Mock).mockResolvedValue(mockTransaction);

      const req = makeAuthRequest({
        audience: "business", // Business audience
        apiKey: {
          userId: null,
          organizationId: "org-1",
        },
        body: {
          currency: "NGN",
          amount: "200000",
          wallet_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        },
      });
      const res = makeRes();
      const next = makeNext();

      await depositFromBasketCurrency(req, res, next);

      // Verify: business audience is used
      expect(mockCheckDepositLimits).toHaveBeenCalledWith(
        "business",
        100,
        null,
        "org-1",
      );
    });

    it("should reject deposit if conversion fails due to missing rates", async () => {
      const mockConvertLocalToUsd = jest.mocked(converter.convertLocalToUsd);
      const mockIsMintingPaused = jest.mocked(limitsService.isMintingPaused);

      // Simulate rate fetch failure
      mockIsMintingPaused.mockResolvedValue(false);
      mockConvertLocalToUsd.mockRejectedValue(
        new AppError("Exchange rates not yet available", 503),
      );

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "test-user-1",
        stellarAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      });

      const req = makeAuthRequest({
        body: {
          currency: "NGN",
          amount: "100000",
          wallet_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        },
      });
      const res = makeRes();
      const next = makeNext();

      await depositFromBasketCurrency(req, res, next);

      // Verify: error handler called
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Exchange rates not yet available",
          statusCode: 503,
        }),
      );
    });

    it("should reject deposit if rates are zero or invalid", async () => {
      const mockConvertLocalToUsd = jest.mocked(converter.convertLocalToUsd);
      const mockIsMintingPaused = jest.mocked(limitsService.isMintingPaused);

      mockIsMintingPaused.mockResolvedValue(false);
      mockConvertLocalToUsd.mockRejectedValue(
        new AppError(
          "Exchange rate for NGN is not available or invalid. Cannot process deposit at this time.",
          503,
        ),
      );

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "test-user-1",
        stellarAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      });

      const req = makeAuthRequest();
      const res = makeRes();
      const next = makeNext();

      await depositFromBasketCurrency(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
        }),
      );
    });

    it("should reject deposit if limit exceeded", async () => {
      const mockCheckDepositLimits = jest.mocked(limitsService.checkDepositLimits);
      const mockConvertLocalToUsd = jest.mocked(converter.convertLocalToUsd);
      const mockIsMintingPaused = jest.mocked(limitsService.isMintingPaused);

      mockIsMintingPaused.mockResolvedValue(false);
      mockConvertLocalToUsd.mockResolvedValue(50000); // Very large amount

      // Simulate limit exceeded error
      mockCheckDepositLimits.mockRejectedValue(
        new AppError(
          "Deposit daily limit exceeded ($10000). Current 24h: $50000.",
          429,
        ),
      );

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "test-user-1",
        stellarAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      });

      const req = makeAuthRequest();
      const res = makeRes();
      const next = makeNext();

      await depositFromBasketCurrency(req, res, next);

      // Verify: error passed to error handler
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Deposit daily limit exceeded"),
          statusCode: 429,
        }),
      );
    });

    it("should respect circuit breaker (minting paused)", async () => {
      const mockIsMintingPaused = jest.mocked(limitsService.isMintingPaused);

      mockIsMintingPaused.mockResolvedValue(true);

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "test-user-1",
        stellarAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      });

      const req = makeAuthRequest();
      const res = makeRes();
      const next = makeNext();

      await depositFromBasketCurrency(req, res, next);

      // Verify: response indicates circuit breaker triggered
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "CIRCUIT_BREAKER",
        }),
      );

      // Verify: converter was NOT called (short-circuited)
      expect(jest.mocked(converter.convertLocalToUsd)).not.toHaveBeenCalled();
    });
  });

  describe("Input Validation", () => {
    it("should reject forbidden deposit currency (USDC)", async () => {
      const mockIsMintingPaused = jest.mocked(limitsService.isMintingPaused);
      mockIsMintingPaused.mockResolvedValue(false);

      const req = makeAuthRequest({
        body: {
          currency: "USDC",
          amount: "1000",
          wallet_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        },
      });
      const res = makeRes();
      const next = makeNext();

      await depositFromBasketCurrency(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "DEPOSIT_ONLY_BASKET_CURRENCIES",
        }),
      );
    });

    it("should reject invalid currency not in basket", async () => {
      const mockIsMintingPaused = jest.mocked(limitsService.isMintingPaused);
      mockIsMintingPaused.mockResolvedValue(false);

      const req = makeAuthRequest({
        body: {
          currency: "JPY",
          amount: "10000",
          wallet_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        },
      });
      const res = makeRes();
      const next = makeNext();

      await depositFromBasketCurrency(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Invalid currency",
        }),
      );
    });

    it("should reject invalid request schema", async () => {
      const req = makeAuthRequest({
        body: {
          currency: "NGN",
          amount: "invalid-amount", // Invalid
          wallet_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        },
      });
      const res = makeRes();
      const next = makeNext();

      await depositFromBasketCurrency(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Invalid request",
        }),
      );
    });
  });

  describe("Transaction Recording", () => {
    it("should create transaction with correct data", async () => {
      const mockCheckDepositLimits = jest.mocked(limitsService.checkDepositLimits);
      const mockConvertLocalToUsd = jest.mocked(converter.convertLocalToUsd);
      const mockIsMintingPaused = jest.mocked(limitsService.isMintingPaused);

      mockConvertLocalToUsd.mockResolvedValue(50);
      mockIsMintingPaused.mockResolvedValue(false);
      mockCheckDepositLimits.mockResolvedValue(undefined);

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "test-user-1",
        stellarAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      });
      (prisma.transaction.create as jest.Mock).mockResolvedValue({
        id: "tx-123",
      });

      const req = makeAuthRequest({
        apiKey: { userId: "test-user-1", organizationId: null },
        body: {
          currency: "NGN",
          amount: "100000",
          wallet_address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        },
      });
      const res = makeRes();
      const next = makeNext();

      await depositFromBasketCurrency(req, res, next);

      // Verify: transaction created with correct data
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "test-user-1",
          type: "mint",
          status: "pending",
          localCurrency: "NGN",
          localAmount: expect.any(Decimal),
          rateSnapshot: expect.objectContaining({
            deposit_currency: "NGN",
            amount: 100000,
            organizationId: null,
            timestamp: expect.any(String),
          }),
        }),
      });
    });
  });
});
