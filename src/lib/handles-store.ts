import { get, set, del } from 'idb-keyval'

const ARTICLE_KEY = 'my-editor:article-handle'
const CHAT_ROOT_KEY = 'my-editor:chat-root-handle'
const WORKFLOW_ROOT_KEY = 'my-editor:workflow-root-handle'

export async function loadArticleHandle(): Promise<FileSystemFileHandle | undefined> {
  return get<FileSystemFileHandle>(ARTICLE_KEY)
}
export async function saveArticleHandle(h: FileSystemFileHandle): Promise<void> {
  await set(ARTICLE_KEY, h)
}
export async function clearArticleHandle(): Promise<void> {
  await del(ARTICLE_KEY)
}

export async function loadChatRootHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return get<FileSystemDirectoryHandle>(CHAT_ROOT_KEY)
}
export async function saveChatRootHandle(h: FileSystemDirectoryHandle): Promise<void> {
  await set(CHAT_ROOT_KEY, h)
}
export async function clearChatRootHandle(): Promise<void> {
  await del(CHAT_ROOT_KEY)
}

export async function loadWorkflowRootHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return get<FileSystemDirectoryHandle>(WORKFLOW_ROOT_KEY)
}
export async function saveWorkflowRootHandle(h: FileSystemDirectoryHandle): Promise<void> {
  await set(WORKFLOW_ROOT_KEY, h)
}
export async function clearWorkflowRootHandle(): Promise<void> {
  await del(WORKFLOW_ROOT_KEY)
}
