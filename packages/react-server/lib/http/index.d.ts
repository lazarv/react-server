export interface HttpContext {
  request: Request;
  url: URL;
  state: Record<string, any>;
  next?: () => Promise<Response | undefined>;
  platform?: {
    runtime: string;
    version?: string;
    request?: any; // Node IncomingMessage
    response?: any; // Node ServerResponse
    [key: string]: any;
  };
  [key: string]: any;
}

export interface CookieSerializeOptions {
  domain?: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None" | string;
}

export interface RequestContextExtensions {
  cookie: Record<string, string>;
}
