"use server";

import { revalidatePath } from "next/cache";

import addTags, { parseTagString } from "@/lib/addTags";
import deletePost from "@/lib/deletePost";
import { deleteTagById, updateTagById } from "@/lib/manageTag";
import { setMediaSettings } from "@/lib/userSettings";

export async function deletePostAction(postId) {
  await deletePost(postId);
  revalidatePath("/media");
}

export async function updatePostTagsAction(postId, rawTagString) {
  const tags = parseTagString(rawTagString);
  addTags(postId, tags, { replace: true });
  revalidatePath("/listing");
}

export async function updateTagAction(tagId, nextTagData) {
  const result = updateTagById(tagId, nextTagData);
  revalidatePath("/tags");
  revalidatePath("/listing");
  return result;
}

export async function deleteTagAction(tagId) {
  const deleted = deleteTagById(tagId);
  revalidatePath("/tags");
  revalidatePath("/listing");
  return { deleted };
}

export async function updateMediaSettingsAction(partialSettings) {
  const media = setMediaSettings(partialSettings);
  revalidatePath("/listing");
  return media;
}
