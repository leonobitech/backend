// 📁 @custom-types/modules/[modulo]/[fileName].ts
// => importar como: @custom-types/modules/[modulo]/[fileName].ts
//==============================================================================
//                                 Imports
//==============================================================================

import { z } from "zod";
// importar tus schemas acá si tenés validaciones con Zod:
// import { someSchema } from "@schemas/[modulo]/someSchema";

//==============================================================================
//                                  Body Types
//==============================================================================

// export type SomeInput = z.infer<typeof someSchema>;

export type RequestMetaInfo = {
  ipAddress: string;
  deviceInfo: {
    browser: string;
    os: string;
    device: string;
  };
};

//==============================================================================
//                                 Params
//==============================================================================

export type [Feature]Params = {
  // definir los datos esperados para una acción
};

//==============================================================================
//                                 Responses
//==============================================================================

export const apiStatuses = ["ok", "error"] as const;
export type ApiStatus = (typeof apiStatuses)[number];

export type BaseResponse = {
  status: ApiStatus;
  message: string;
};

export type [Feature]Response = BaseResponse & {
  data: {
    id: string;
    // más campos...
  };
};

//==============================================================================
//                               Variantes o Resultados
//==============================================================================

export type [Feature]Result =
  | {
      status: "ok";
      message: string;
      data: {
        // datos devueltos
      };
    }
  | {
      status: "error";
      message: string;
    };

//==============================================================================
//                                Extras comunes
//==============================================================================

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
};
