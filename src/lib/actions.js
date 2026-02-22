"use server";

import deletePost from "@/lib/deletePost";
import { updatePostTags } from "@/lib/updatePostTags";
import { revalidatePath } from "next/cache";

export async function deletePostAction(postId) {
  await deletePost(postId);
  revalidatePath("/media");
}

export async function updatePostTagsAction(postId, rawTagString) {
  await updatePostTags(postId, rawTagString);
  revalidatePath("/listing");
}
