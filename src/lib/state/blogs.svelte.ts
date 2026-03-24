import type { BlogPost } from '$lib/types';
import { db, storage } from '$lib/firebase';
import authState from './auth.svelte';
import { uniqueSlug } from '$lib/utils/slug';
import {
	collection,
	doc,
	addDoc,
	updateDoc,
	deleteDoc,
	setDoc,
	onSnapshot,
	query,
	where,
	orderBy,
	type Unsubscribe
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { compressImage, imageExtension } from '$lib/utils/imageUtils';

const blogsRef = collection(db, 'blogs');

/** Strip non-serializable fields before saving to Firestore */
function serializeBlog(blog: BlogPost, userId: string) {
	return {
		userId,
		title: blog.title,
		subtitle: blog.subtitle ?? null,
		coverImageUrl: blog.coverImageUrl ?? null,
		content: blog.content,
		tags: blog.tags ?? [],
		category: blog.category,
		visibility: blog.visibility,
		slug: blog.slug,
		excerpt: blog.excerpt ?? '',
		readingTime: blog.readingTime ?? 1,
		linkedTripIds: blog.linkedTripIds ?? [],
		youtubeUrl: blog.youtubeUrl ?? null,
		locations: blog.locations ?? [],
		routes: blog.routes ?? [],
		cities: [...new Set(blog.locations?.map((l) => l.city).filter((v): v is string => !!v) ?? [])],
		states: [...new Set(blog.locations?.map((l) => l.state).filter((v): v is string => !!v) ?? [])],
		countries: [...new Set(blog.locations?.map((l) => l.country).filter((v): v is string => !!v) ?? [])],
		createdAt: blog.createdAt,
		updatedAt: blog.updatedAt,
		publishedAt: blog.publishedAt ?? null
	};
}

function createBlogsState() {
	let blogs = $state<BlogPost[]>([]);
	let loading = $state(true);
	let unsubFn: Unsubscribe | null = null;

	return {
		get blogs() {
			return blogs;
		},
		get count() {
			return blogs.length;
		},
		get loading() {
			return loading;
		},

		subscribe() {
			this.unsubscribe();
			const uid = authState.user?.id;
			if (!uid) {
				blogs = [];
				loading = false;
				return;
			}
			loading = true;
			const q = query(blogsRef, where('userId', '==', uid), orderBy('createdAt', 'desc'));
			unsubFn = onSnapshot(q, (snapshot) => {
				blogs = snapshot.docs.map((d) => {
					const data = d.data();
					return {
						id: d.id,
						userId: data.userId,
						title: data.title ?? '',
						subtitle: data.subtitle ?? null,
						coverImageUrl: data.coverImageUrl ?? null,
						coverImageFile: null,
						content: data.content ?? {},
						tags: data.tags ?? [],
						category: data.category ?? 'guide',
						visibility: data.visibility ?? 'draft',
						slug: data.slug ?? '',
						excerpt: data.excerpt ?? '',
						readingTime: data.readingTime ?? 1,
						linkedTripIds: data.linkedTripIds ?? [],
						youtubeUrl: data.youtubeUrl ?? null,
						locations: data.locations ?? [],
						routes: data.routes ?? [],
						cities: data.cities ?? [],
						states: data.states ?? [],
						countries: data.countries ?? [],
						createdAt: data.createdAt,
						updatedAt: data.updatedAt,
						publishedAt: data.publishedAt ?? null
					} as BlogPost;
				});
				loading = false;
			});
		},

		unsubscribe() {
			if (unsubFn) {
				unsubFn();
				unsubFn = null;
			}
		},

		getBlog(id: string): BlogPost | undefined {
			return blogs.find((b) => b.id === id);
		},

		async addBlog(blog: BlogPost): Promise<string | undefined> {
			const uid = authState.user?.id;
			if (!uid) return;

			const slug = uniqueSlug(blog.title || 'untitled');
			blog.slug = slug;

			const data = serializeBlog(blog, uid);
			const docRef = await addDoc(blogsRef, data);
			const docId = docRef.id;

			// Create slug index
			await setDoc(doc(db, 'blogSlugs', slug), { blogId: docId, userId: uid });

			// Upload cover image if present
			if (blog.coverImageFile) {
				try {
					const compressed = await compressImage(blog.coverImageFile, 1600, 0.82);
					const ext = imageExtension(compressed);
					const imgRef = storageRef(storage, `blogs/${docId}/cover.${ext}`);
					await uploadBytes(imgRef, compressed, {
						contentType: compressed.type,
						cacheControl: 'public, max-age=31536000'
					});
					const coverImageUrl = await getDownloadURL(imgRef);
					await updateDoc(docRef, { coverImageUrl });
				} catch (err) {
					console.warn('[Blogs] Cover image upload failed:', err);
				}
			}

			return docId;
		},

		async updateBlog(id: string, updates: Partial<BlogPost>) {
			const uid = authState.user?.id;
			if (!uid) return;
			const docRef = doc(db, 'blogs', id);
			const data: Record<string, unknown> = {};

			if (updates.title !== undefined) data.title = updates.title;
			if (updates.subtitle !== undefined) data.subtitle = updates.subtitle;
			if (updates.content !== undefined) data.content = updates.content;
			if (updates.tags !== undefined) data.tags = updates.tags;
			if (updates.category !== undefined) data.category = updates.category;
			if (updates.visibility !== undefined) data.visibility = updates.visibility;
			if (updates.excerpt !== undefined) data.excerpt = updates.excerpt;
			if (updates.readingTime !== undefined) data.readingTime = updates.readingTime;
			if (updates.linkedTripIds !== undefined) data.linkedTripIds = updates.linkedTripIds;
			if (updates.youtubeUrl !== undefined) data.youtubeUrl = updates.youtubeUrl;
			if (updates.publishedAt !== undefined) data.publishedAt = updates.publishedAt;
			if (updates.updatedAt !== undefined) data.updatedAt = updates.updatedAt;

			if (updates.locations !== undefined) {
				data.locations = updates.locations;
				data.cities = [...new Set(updates.locations.map((l) => l.city).filter((v): v is string => !!v))];
				data.states = [...new Set(updates.locations.map((l) => l.state).filter((v): v is string => !!v))];
				data.countries = [...new Set(updates.locations.map((l) => l.country).filter((v): v is string => !!v))];
			}
			if (updates.routes !== undefined) data.routes = updates.routes;

			// Upload cover image if a new file is present
			if (updates.coverImageFile) {
				try {
					const compressed = await compressImage(updates.coverImageFile, 1600, 0.82);
					const ext = imageExtension(compressed);
					const imgRef = storageRef(storage, `blogs/${id}/cover.${ext}`);
					await uploadBytes(imgRef, compressed, {
						contentType: compressed.type,
						cacheControl: 'public, max-age=31536000'
					});
					data.coverImageUrl = await getDownloadURL(imgRef);
				} catch (err) {
					console.warn('[Blogs] Cover image upload failed:', err);
				}
			}

			await updateDoc(docRef, data);
		},

		async deleteBlog(id: string) {
			const uid = authState.user?.id;
			if (!uid) return;

			// Find the blog to get its slug
			const blog = blogs.find((b) => b.id === id);

			// Delete storage files
			try {
				const folderRef = storageRef(storage, `blogs/${id}`);
				const list = await listAll(folderRef);
				await Promise.all(list.items.map((item) => deleteObject(item)));
			} catch (err) {
				console.warn('[Blogs] Storage cleanup:', err);
			}

			// Delete slug index
			if (blog?.slug) {
				try {
					await deleteDoc(doc(db, 'blogSlugs', blog.slug));
				} catch (err) {
					console.warn('[Blogs] Slug cleanup:', err);
				}
			}

			await deleteDoc(doc(db, 'blogs', id));
		},

		async uploadBlogImage(blogId: string, file: File): Promise<string | null> {
			const uid = authState.user?.id;
			if (!uid) return null;
			try {
				const compressed = await compressImage(file, 1600, 0.82);
				const ext = imageExtension(compressed);
				const id = Math.random().toString(36).slice(2, 10);
				const imgRef = storageRef(storage, `blogs/${blogId}/images/${id}.${ext}`);
				await uploadBytes(imgRef, compressed, {
					contentType: compressed.type,
					cacheControl: 'public, max-age=31536000'
				});
				return await getDownloadURL(imgRef);
			} catch (err) {
				console.warn('[Blogs] Image upload failed:', err);
				return null;
			}
		}
	};
}

const blogsState = createBlogsState();
export default blogsState;
