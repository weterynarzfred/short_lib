"use server";

import { revalidatePath } from "next/cache";

import addTags, { parseTagString } from "@/lib/addTags";
import deletePost from "@/lib/deletePost";

export async function deletePostAction(postId) {
  await deletePost(postId);
  revalidatePath("/media");
}

export async function updatePostTagsAction(postId, rawTagString) {
  const tags = parseTagString(rawTagString);
  addTags(postId, tags, { replace: true });
  revalidatePath("/listing");
}
