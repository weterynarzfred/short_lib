"use server";

import deletePost from "@/lib/deletePost";
import { revalidatePath } from "next/cache";

export async function deletePostAction(postId) {
  await deletePost(postId);
  revalidatePath("/media");
}
