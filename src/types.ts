export interface IInfoResponse {
  author: { email: string; name: string };
  frontend: { url: string };
  language: 'node.js' | 'python';
  sources: string;
  answers: { [key: number]: string };
}