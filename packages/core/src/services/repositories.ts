import { isLiteRuntime } from "../config";

import * as lite from "./repositories-lite";
import * as sql from "./repositories-sql";

export const ensureUser: typeof sql.ensureUser = (input) =>
  (isLiteRuntime() ? lite.ensureUser(input) : sql.ensureUser(input));

export const getUserById: typeof sql.getUserById = (userId) =>
  (isLiteRuntime() ? lite.getUserById(userId) : sql.getUserById(userId));

export const updateUserProfile: typeof sql.updateUserProfile = (input) =>
  (isLiteRuntime() ? lite.updateUserProfile(input) : sql.updateUserProfile(input));

export const upsertConnection: typeof sql.upsertConnection = (input) =>
  (isLiteRuntime() ? lite.upsertConnection(input) : sql.upsertConnection(input));

export const listConnections: typeof sql.listConnections = (userId) =>
  (isLiteRuntime() ? lite.listConnections(userId) : sql.listConnections(userId));

export const getConnectionById: typeof sql.getConnectionById = (connectionId) =>
  (isLiteRuntime() ? lite.getConnectionById(connectionId) : sql.getConnectionById(connectionId));

export const updateConnectionSyncState: typeof sql.updateConnectionSyncState = (input) =>
  (isLiteRuntime() ? lite.updateConnectionSyncState(input) : sql.updateConnectionSyncState(input));

export const disconnectConnection: typeof sql.disconnectConnection = (userId, provider) =>
  (isLiteRuntime() ? lite.disconnectConnection(userId, provider) : sql.disconnectConnection(userId, provider));

export const createKnowledgeItem: typeof sql.createKnowledgeItem = (input) =>
  (isLiteRuntime() ? lite.createKnowledgeItem(input) : sql.createKnowledgeItem(input));

export const softDeleteKnowledgeItem: typeof sql.softDeleteKnowledgeItem = (input) =>
  (isLiteRuntime() ? lite.softDeleteKnowledgeItem(input) : sql.softDeleteKnowledgeItem(input));

export const listKnowledgeItems: typeof sql.listKnowledgeItems = (userId) =>
  (isLiteRuntime() ? lite.listKnowledgeItems(userId) : sql.listKnowledgeItems(userId));

export const getKnowledgeItemById: typeof sql.getKnowledgeItemById = (input) =>
  (isLiteRuntime() ? lite.getKnowledgeItemById(input) : sql.getKnowledgeItemById(input));

export const updateKnowledgeItemRawText: typeof sql.updateKnowledgeItemRawText = (input) =>
  (isLiteRuntime() ? lite.updateKnowledgeItemRawText(input) : sql.updateKnowledgeItemRawText(input));

export const getKnowledgeDocument: typeof sql.getKnowledgeDocument = (input) =>
  (isLiteRuntime() ? lite.getKnowledgeDocument(input) : sql.getKnowledgeDocument(input));

export const upsertDocumentBatch: typeof sql.upsertDocumentBatch = (documents) =>
  (isLiteRuntime() ? lite.upsertDocumentBatch(documents) : sql.upsertDocumentBatch(documents));

export const createConversation: typeof sql.createConversation = (input) =>
  (isLiteRuntime() ? lite.createConversation(input) : sql.createConversation(input));

export const listConversations: typeof sql.listConversations = (userId) =>
  (isLiteRuntime() ? lite.listConversations(userId) : sql.listConversations(userId));

export const getConversationById: typeof sql.getConversationById = (input) =>
  (isLiteRuntime() ? lite.getConversationById(input) : sql.getConversationById(input));

export const saveMessage: typeof sql.saveMessage = (input) =>
  (isLiteRuntime() ? lite.saveMessage(input) : sql.saveMessage(input));

export const getConversationMessages: typeof sql.getConversationMessages = (
  conversationId,
  limit,
) =>
  (isLiteRuntime()
    ? lite.getConversationMessages(conversationId, limit)
    : sql.getConversationMessages(conversationId, limit));

export const listMemories: typeof sql.listMemories = (userId) =>
  (isLiteRuntime() ? lite.listMemories(userId) : sql.listMemories(userId));

export const upsertMemory: typeof sql.upsertMemory = (input) =>
  (isLiteRuntime() ? lite.upsertMemory(input) : sql.upsertMemory(input));

export const deleteMemory: typeof sql.deleteMemory = (input) =>
  (isLiteRuntime() ? lite.deleteMemory(input) : sql.deleteMemory(input));

export const appendAuditLog: typeof sql.appendAuditLog = (client, input) =>
  (isLiteRuntime() ? lite.appendAuditLog(client, input) : sql.appendAuditLog(client, input));

export const listAuditLogs: typeof sql.listAuditLogs = (userId) =>
  (isLiteRuntime() ? lite.listAuditLogs(userId) : sql.listAuditLogs(userId));

export const createTask: typeof sql.createTask = (input) =>
  (isLiteRuntime() ? lite.createTask(input) : sql.createTask(input));

export const listTasks: typeof sql.listTasks = (userId) =>
  (isLiteRuntime() ? lite.listTasks(userId) : sql.listTasks(userId));

export const getBasicAnalytics: typeof sql.getBasicAnalytics = (userId) =>
  (isLiteRuntime() ? lite.getBasicAnalytics(userId) : sql.getBasicAnalytics(userId));

export const exportUserData: typeof sql.exportUserData = (userId) =>
  (isLiteRuntime() ? lite.exportUserData(userId) : sql.exportUserData(userId));

export const hardDeleteUserData: typeof sql.hardDeleteUserData = (userId) =>
  (isLiteRuntime() ? lite.hardDeleteUserData(userId) : sql.hardDeleteUserData(userId));
