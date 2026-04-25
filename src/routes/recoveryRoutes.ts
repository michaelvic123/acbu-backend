import { Router } from "express";
import {
  postUnlock,
  postUnlockVerify,
} from "../controllers/recoveryController";
import { standardRateLimiter } from "../middleware/rateLimiter";

const router: ReturnType<typeof Router> = Router();

router.use(standardRateLimiter);

/**
 * @swagger
 * tags:
 *   - name: Recovery
 *     description: Account recovery and unlocking
 */

/**
 * @swagger
 * /v1/recovery/unlock:
 *   post:
 *     tags:
 *       - Recovery
 *     summary: Unlock account for recovery
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - passcode
 *             properties:
 *               identifier:
 *                 type: string
 *               passcode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Unlock request accepted
 */
router.post("/unlock", postUnlock);

/**
 * @swagger
 * /v1/recovery/unlock/verify:
 *   post:
 *     tags:
 *       - Recovery
 *     summary: Verify recovery OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - challenge_token
 *               - code
 *             properties:
 *               challenge_token:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Recovery verified successfully
 */
router.post("/unlock/verify", postUnlockVerify);

export default router;
