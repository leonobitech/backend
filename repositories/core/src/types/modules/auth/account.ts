// 📁 @types/modules/auth/account
// => import as @custom-types/modules/auth/account

import { z } from "zod";
import {
  verifyEmailSchema,
  loginSchema,
  resetPasswordSchema,
  emailSchema,
} from "@schemas/accountSchemas";
import { API_STATUS, ApiStatus } from "@constants/apiStatus";
import { UserRole } from "@constants/userRole";

//==============================================================================
//                                    Requests
//==============================================================================

export type VerifyEmailBody = z.infer<typeof verifyEmailSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;

export type CreateAccountParams = {
  email: string;
  password: string;
  meta: RequestMeta;
};

export type VerifyEmailParams = VerifyEmailBody & { meta: RequestMeta };
export type LoginParams = LoginBody & { meta: RequestMeta };
export type DeviceValidationParams = VerifyEmailBody & { meta: RequestMeta };
export type ResetPasswordRequest = z.infer<typeof emailSchema>;
export type ResetPasswordParamsRequest = ResetPasswordBody & {
  meta: RequestMeta;
};

//==============================================================================
//                                    Responses
//==============================================================================

export type BaseResponse = {
  status: ApiStatus;
  message: string;
};

export type TokenSet = {
  accessTokenId: string;
  hashedPublicKey: string;
};

export type RefreshTokenSet = {
  accessTokenId: string;
  hashedPublicKey: string;
  accessToken: string;
};

export type CreateAccountResponse = BaseResponse & {
  status: typeof API_STATUS.CREATED;
  message: string;
  data: {
    userId: string;
    email: string;
    requestId: string;
    expiresIn: number;
    verified: boolean;
  };
};

export type VerifyEmailResult =
  | {
      status: typeof API_STATUS.VERIFIED;
      message: string;
      data: {
        userId: string;
        email: string;
        sessionId: string;
        role: UserRole;
      };
      tokens: TokenSet;
    }
  | {
      status: typeof API_STATUS.RESEND;
      message: string;
      resend: true;
    }
  | {
      status: typeof API_STATUS.ALREADY_VERIFIED;
      message: string;
      alreadyVerified: true;
    };

export type LoginResponse = {
  status: typeof API_STATUS.SUCCESS;
  message: string;
  data: {
    userId: string;
    email: string;
    sessionId: string;
    role: UserRole;
  };
  tokens: TokenSet;
};

export type LoginDeviceValidatedResponse = {
  status: typeof API_STATUS.SUCCESS;
  message: string;
  data: {
    deviceId: string;
  };
};

export type LoginDevicePendingVerificationResponse = {
  status: typeof API_STATUS.DEVICE_PENDING_VERIFICATION;
  message: string;
  data: {
    userId: string;
    email: string;
    codeSent: boolean;
  };
};

export type LoginDeviceCheckResponse =
  | LoginDeviceValidatedResponse
  | LoginDevicePendingVerificationResponse;

export type DeviceValidationResponse =
  | {
      status: typeof API_STATUS.DEVICE_VALIDATED;
      message: string;
      data: {
        userId: string;
        email: string;
        sessionId: string;
        role: UserRole;
      };
      tokens: TokenSet;
    }
  | {
      status: typeof API_STATUS.RESEND;
      message: string;
      resend: true;
    }
  | {
      status: typeof API_STATUS.ALREADY_VALIDATED;
      message: string;
      alreadyVerified: true;
    };

export type RefreshTokenResponse = {
  status: typeof API_STATUS.REFRESHED;
  message: string;
  data: {
    userId: string;
    email: string;
    sessionId: string;
  };
  tokens: RefreshTokenSet;
};

export type LogoutResponse = {
  status: typeof API_STATUS.LOGGED_OUT;
  message: string;
  data: {
    userId: string;
    sessionId: string;
  };
};

export type LogoutOthersResponse = {
  status: typeof API_STATUS.OTHERS_LOGGED_OUT;
  message: string;
  data: {
    userId: string;
    sessionKept: string;
  };
};

export type ErrorResponse = {
  status: typeof API_STATUS.ERROR;
  message: string;
  error?: string;
};

export type ResetPasswordRequestResponse = {
  status: typeof API_STATUS.PASSWORD_RESET_CODE_SENT;
  message: string;
  data: {
    email: string;
    codeSent: boolean;
  };
};

export type ResetPasswordResponse =
  | {
      status: typeof API_STATUS.PASSWORD_RESET_SUCCESS;
      message: string;
      data: {
        userId: string;
        email: string;
        sessionId: string;
      };
      tokens: TokenSet;
    }
  | {
      status: typeof API_STATUS.RESEND;
      message: string;
      resend: true;
    };
