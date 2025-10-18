/**
 * OAuth Token Entity
 *
 * Representa un token OAuth con toda su metadata.
 * Esta es una entidad del dominio con identidad única (jti).
 */

export interface OAuthTokenProps {
  jti: string;              // JWT ID (único)
  sub: string;              // Subject (user ID)
  scope: string;            // Scopes separados por espacio
  iat: number;              // Issued at (timestamp)
  exp: number;              // Expiration (timestamp)
  clientFingerprint?: string; // Fingerprint del cliente
}

export class OAuthToken {
  private constructor(
    private readonly props: OAuthTokenProps
  ) {}

  /**
   * Crea un nuevo token OAuth
   */
  static create(props: OAuthTokenProps): OAuthToken {
    // Validaciones de negocio
    if (!props.jti || props.jti.length === 0) {
      throw new Error('Token must have a valid JTI');
    }

    if (!props.sub || props.sub.length === 0) {
      throw new Error('Token must have a valid subject');
    }

    if (props.exp <= props.iat) {
      throw new Error('Token expiration must be after issued time');
    }

    return new OAuthToken(props);
  }

  /**
   * Reconstruye un token desde persistencia
   */
  static fromPersistence(props: OAuthTokenProps): OAuthToken {
    return new OAuthToken(props);
  }

  // Getters
  get jti(): string {
    return this.props.jti;
  }

  get sub(): string {
    return this.props.sub;
  }

  get scope(): string {
    return this.props.scope;
  }

  get issuedAt(): Date {
    return new Date(this.props.iat * 1000);
  }

  get expiresAt(): Date {
    return new Date(this.props.exp * 1000);
  }

  get clientFingerprint(): string | undefined {
    return this.props.clientFingerprint;
  }

  /**
   * Verifica si el token ha expirado
   */
  isExpired(): boolean {
    return Date.now() >= this.props.exp * 1000;
  }

  /**
   * Verifica si el token expira pronto (dentro de N segundos)
   */
  expiresWithin(seconds: number): boolean {
    const expirationTime = this.props.exp * 1000;
    const threshold = Date.now() + (seconds * 1000);
    return expirationTime <= threshold;
  }

  /**
   * Verifica si tiene un scope específico
   */
  hasScope(scope: string): boolean {
    const scopes = this.props.scope.split(' ');
    return scopes.includes(scope);
  }

  /**
   * Verifica si tiene todos los scopes requeridos
   */
  hasAllScopes(requiredScopes: string[]): boolean {
    const tokenScopes = this.props.scope.split(' ');
    return requiredScopes.every(scope => tokenScopes.includes(scope));
  }

  /**
   * Convierte a objeto plano para persistencia
   */
  toPersistence(): OAuthTokenProps {
    return { ...this.props };
  }
}
