
import axios from 'axios';
import { userInfo } from '@/store';
import { drive } from '@/constants';
import type {
  CollabItems, Collab, CollabDirectory,
  UploadFromUrl,
} from '@/types/interfaces';

const { DRIVE_API_URL } = drive;

const axiosInstance = axios.create();
let user = {} as Oidc.User;

userInfo.subscribe((newUser: Oidc.User) => {
  axiosInstance.defaults.headers.Authorization = `Bearer ${newUser?.access_token}`;
  user = newUser;
});

function getAllCollabs(): Promise<Array<Collab>> {
  const endpoint = `${DRIVE_API_URL}/repos/`;
  return axiosInstance.get(endpoint).then(r => r.data);
}

export async function findMyCollabs(): Promise<Array<Collab>> {
  const collabs = await getAllCollabs();
  const foundCollab = collabs.filter(
    (collab: Collab) => collab.modifier_name === user.profile.preferred_username,
  );
  return foundCollab;
}

export async function findCollabIdByName(collabName: string): Promise<string> {
  const collabs = await getAllCollabs();
  const foundCollab = collabs.find((collab: Collab) => collab.name === collabName);
  return foundCollab?.id;
}

async function findItems(collabId: string, isFolder = false): Promise<Array<string>> {
  const params = {
    t: isFolder ? 'd' : 'f',
    p: '/'
  };
  const endpoint = `${DRIVE_API_URL}/repos/${collabId}/dir/`;
  const response = await axiosInstance.get(endpoint, { params });
  const items = response.data;
  return items.map((item: CollabDirectory) => item.name);
}

export async function findItemsByCollabId(collabId: string): Promise<CollabItems> {
  const [ files, folders ] = await Promise.all([
    findItems(collabId, false),
    findItems(collabId, true),
  ]);

  return { files, folders };
}
    
async function createFolder(collabId: string, folderName: string) {
  if (!folderName.startsWith('/')) {
    folderName = `/${folderName}`;
  }

  const existingFolders = await findItems(collabId, true);
  if (existingFolders.includes(folderName.replace(/\//g, ''))) return;

  const params = { 'p': folderName };
  // it is not a json payload but application/x-www-form-urlencoded
  const data = "operation=mkdir";
  const endpoint = `${DRIVE_API_URL}/repos/${collabId}/dir/`;

  return axiosInstance({
    method: 'post',
    url: endpoint,
    params,
    data,
  });
}

async function getUploadLink(collabId: string) : Promise<string> {
  const params = { 'p': '/' };
  const endpoint = `${DRIVE_API_URL}/repos/${collabId}/upload-link/`;
  const response = await axiosInstance.get(endpoint, { params });
  const uploadLink: string = response.data;
  return uploadLink;
}

export async function getFileContent(fileUrl: string) : Promise<Blob> {
  return axios({
    method: 'get',
    url: fileUrl,
    responseType: 'blob'
  }).then(response => response.data);
}

export async function getFileContentAndReplace(
  fileUrl: string, placeholder: string, newText: string
) : Promise<Blob> {
  const fileContent: Blob = await getFileContent(fileUrl);
  const originalType = fileContent.type;
  let textContent: string = await fileContent.text();
  if (textContent.includes(placeholder)) {
    textContent = textContent.replace(placeholder, newText);
  }
  return new Blob([textContent], {type: originalType});
}


export async function uploadFromUrl(uploadObj : UploadFromUrl) {
  let fetchFileFn = () => {
    if (uploadObj.placeholder && uploadObj.newText) {
      return getFileContentAndReplace(
        uploadObj.fileUrl,
        uploadObj.placeholder,
        uploadObj.newText
      );
    }
    return getFileContent(uploadObj.fileUrl);
  };
  const [uploadLink, fileContent] = await Promise.all([
    getUploadLink(uploadObj.collabId),
    fetchFileFn(),
    createFolder(uploadObj.collabId, uploadObj.parentFolder),
  ]);
  const fileNmae = decodeURIComponent(uploadObj.fileUrl.split('/').pop());
  const formData = new FormData();
  formData.append('file', fileContent, fileNmae);
  formData.append('filename', 'test2.txt');
  formData.append('file_name', 'test2.txt');
  formData.append('name', 'test2.txt');
  formData.append('replace', '1'),
  formData.append('ret-json', '1'),
  formData.append('parent_dir', uploadObj.parentFolder);
  return axios.post(uploadLink, formData);
}

export default {};

