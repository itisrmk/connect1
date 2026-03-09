import {
  BaseConnector,
  type ConnectorConfig,
  type ConnectionCredentials,
  type PaginationParams,
  type PaginatedResult,
  type File,
} from "connect1";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

export class GoogleDriveConnector extends BaseConnector {
  config: ConnectorConfig = {
    id: "google-drive",
    name: "Google Drive",
    domains: ["files"],
    authType: "oauth2",
    baseUrl: DRIVE_API,
    oauth: {
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      defaultScopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive.file",
      ],
    },
    description: "Google Drive file storage integration",
  };

  async testConnection(credentials: ConnectionCredentials): Promise<boolean> {
    const res = await fetch(`${DRIVE_API}/about?fields=user`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    return res.ok;
  }

  async listFiles(
    credentials: ConnectionCredentials,
    folderId?: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<File>> {
    const query = new URLSearchParams({
      pageSize: String(params?.limit ?? 20),
      fields:
        "nextPageToken,files(id,name,mimeType,size,parents,webViewLink,webContentLink,createdTime,modifiedTime,owners)",
      orderBy: "modifiedTime desc",
    });

    if (folderId) {
      query.set("q", `'${folderId}' in parents and trashed = false`);
    } else {
      query.set("q", "trashed = false");
    }

    if (params?.cursor) query.set("pageToken", params.cursor);

    const res = await fetch(`${DRIVE_API}/files?${query}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });

    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const data = (await res.json()) as DriveListResponse;

    const files: File[] = (data.files ?? []).map((f) => ({
      id: f.id,
      provider: "google-drive",
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ? Number(f.size) : undefined,
      parentId: f.parents?.[0],
      webUrl: f.webViewLink,
      downloadUrl: f.webContentLink,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      createdAt: f.createdTime,
      modifiedAt: f.modifiedTime,
      createdBy: f.owners?.[0]
        ? {
            id: f.owners[0].permissionId ?? f.owners[0].emailAddress,
            name: f.owners[0].displayName,
            email: f.owners[0].emailAddress,
          }
        : undefined,
      raw: f as unknown as Record<string, unknown>,
    }));

    return {
      data: files,
      nextCursor: data.nextPageToken,
      hasMore: !!data.nextPageToken,
    };
  }

  async getFile(
    credentials: ConnectionCredentials,
    fileId: string
  ): Promise<File> {
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType,size,parents,webViewLink,webContentLink,createdTime,modifiedTime,owners`,
      { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
    );

    if (!res.ok) throw new Error(`Drive get file failed: ${res.status}`);
    const f = (await res.json()) as DriveFile;

    return {
      id: f.id,
      provider: "google-drive",
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ? Number(f.size) : undefined,
      parentId: f.parents?.[0],
      webUrl: f.webViewLink,
      downloadUrl: f.webContentLink,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      createdAt: f.createdTime,
      modifiedAt: f.modifiedTime,
      raw: f as unknown as Record<string, unknown>,
    };
  }
}

// --- Drive API types ---

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  owners?: {
    displayName: string;
    emailAddress: string;
    permissionId?: string;
  }[];
};

type DriveListResponse = {
  files?: DriveFile[];
  nextPageToken?: string;
};

export default GoogleDriveConnector;
