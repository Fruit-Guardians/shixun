// The credential is validated at the owner-private Sites ingress. This header
// identifies the program protocol; it is not a replacement for authentication.
export function isProgramSync(request:Request){return !request.headers.has('origin')&&!request.headers.has('sec-fetch-site')&&request.headers.get('x-sites-report-sync')==='google-apps-script';}
