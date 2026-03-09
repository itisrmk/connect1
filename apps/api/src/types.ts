export type AppEnv = {
  Variables: {
    tenantId: string;
    tenant: {
      id: string;
      name: string;
      email: string;
      plan: string;
    };
    apiKey: {
      id: string;
      tenantId: string;
      key: string;
      scopes: string[] | null;
    };
  };
};
