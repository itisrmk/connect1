import { GmailConnector } from "@connect1/connector-gmail";
import { SlackConnector } from "@connect1/connector-slack";
import { GoogleDriveConnector } from "@connect1/connector-google-drive";
import { NotionConnector } from "@connect1/connector-notion";
import { GoogleCalendarConnector } from "@connect1/connector-google-calendar";
import type { BaseConnector } from "connect1";

const connectorRegistry = new Map<string, BaseConnector>();

// Register all connectors
const gmail = new GmailConnector();
const slack = new SlackConnector();
const googleDrive = new GoogleDriveConnector();
const notion = new NotionConnector();
const googleCalendar = new GoogleCalendarConnector();

connectorRegistry.set(gmail.config.id, gmail);
connectorRegistry.set(slack.config.id, slack);
connectorRegistry.set(googleDrive.config.id, googleDrive);
connectorRegistry.set(notion.config.id, notion);
connectorRegistry.set(googleCalendar.config.id, googleCalendar);

export function getConnector(providerId: string): BaseConnector | undefined {
  return connectorRegistry.get(providerId);
}

export function listProviders() {
  return Array.from(connectorRegistry.values()).map((c) => ({
    id: c.config.id,
    name: c.config.name,
    domains: c.config.domains,
    authType: c.config.authType,
    description: c.config.description,
  }));
}

export { connectorRegistry };
