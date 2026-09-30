import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import type {
  AdminProfile,
  AdminParticipantRow,
  CatalogKind,
  CatalogOption,
  Course,
  CourseEdition,
  PaginationInfo,
  PaymentMethod,
} from "@shared/api";
import { authHeaders, formatAxiosError } from "@/lib/api";
import type { RootState } from "../index";

export interface Participant {
  id: number;
  status: string;
  amountCents: number;
  currency: string;
  paymentMethod: PaymentMethod | null;
  cardBrand: string | null;
  cardLast4: string | null;
  paidAt: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  audience: string;
}

export interface PaymentRow {
  id: number;
  amountCents: number;
  currency: string;
  status: string;
  method: string;
  cardBrand: string | null;
  cardLast4: string | null;
  courseTitle: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  createdAt: string;
}

export interface AdminListQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortDir?: "ASC" | "DESC";
  courseId?: number;
  editionId?: number;
}

export interface EditionOption extends CourseEdition {
  courseTitle?: string;
  courseSlug?: string;
}

interface AdminState {
  stats: {
    publishedCourses: number;
    upcomingEditions: number;
    paidSeats: number;
    revenueCents: number;
    openRequests: number;
  } | null;
  upcoming: Array<CourseEdition & { courseTitle?: string }>;
  courses: Course[];
  coursesPagination: PaginationInfo | null;
  course: Course | null;
  editions: CourseEdition[];
  openEditions: EditionOption[];
  participants: Participant[];
  participantRows: AdminParticipantRow[];
  participantsPagination: PaginationInfo | null;
  editionId: number | null;
  feedback: { averageRating: number | null; reviews: number };
  payments: PaymentRow[];
  paymentsPagination: PaginationInfo | null;
  team: AdminProfile[];
  teamPagination: PaginationInfo | null;
  catalog: Record<CatalogKind, CatalogOption[]>;
  catalogLoading: boolean;
  loading: boolean;
  listLoading: boolean;
  saving: boolean;
  error: string | null;
}

const emptyCatalog: Record<CatalogKind, CatalogOption[]> = {
  categories: [],
  levels: [],
  audiences: [],
  cities: [],
  venues: [],
};

const emptyPagination = null;

const initialState: AdminState = {
  stats: null,
  upcoming: [],
  courses: [],
  coursesPagination: emptyPagination,
  course: null,
  editions: [],
  openEditions: [],
  participants: [],
  participantRows: [],
  participantsPagination: emptyPagination,
  editionId: null,
  feedback: { averageRating: null, reviews: 0 },
  payments: [],
  paymentsPagination: emptyPagination,
  team: [],
  teamPagination: emptyPagination,
  catalog: emptyCatalog,
  catalogLoading: false,
  loading: false,
  listLoading: false,
  saving: false,
  error: null,
};

function headers(getState: () => unknown) {
  return authHeaders((getState() as RootState).adminAuth.token);
}

function listParams(query: AdminListQuery = {}) {
  return {
    page: query.page || 1,
    limit: query.limit || 20,
    search: query.search || undefined,
    sortBy: query.sortBy || undefined,
    sortDir: query.sortDir || undefined,
    courseId: query.courseId || undefined,
    editionId: query.editionId || undefined,
  };
}

export const fetchAdminDashboard = createAsyncThunk("admin/dashboard", async (_, { getState, rejectWithValue }) => {
  try {
    const { data } = await axios.get("/api/admin/dashboard", { headers: headers(getState) });
    return data as { stats: AdminState["stats"]; upcoming: AdminState["upcoming"] };
  } catch (error) {
    return rejectWithValue(formatAxiosError(error));
  }
});

export const fetchAdminCourses = createAsyncThunk(
  "admin/courses",
  async (query: AdminListQuery | undefined, { getState, rejectWithValue }) => {
    try {
      const { data } = await axios.get("/api/admin/courses", {
        headers: headers(getState),
        params: listParams(query),
      });
      return data as { courses: Course[]; pagination: PaginationInfo };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const checkCourseSlug = createAsyncThunk(
  "admin/checkCourseSlug",
  async (input: { slug?: string; title?: string }, { getState, rejectWithValue }) => {
    try {
      const { data } = await axios.get("/api/admin/courses/slug-availability", {
        headers: headers(getState),
        params: {
          ...(input.slug ? { slug: input.slug } : {}),
          ...(input.title ? { title: input.title } : {}),
        },
      });
      return data as { requested: string; available: boolean; suggested: string };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const createCourse = createAsyncThunk(
  "admin/createCourse",
  async (body: Record<string, unknown>, { getState, rejectWithValue }) => {
    try {
      const { data } = await axios.post("/api/admin/courses", body, { headers: headers(getState) });
      return data as { id: number; slug: string; slugAdjusted?: boolean };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        const payload = error.response.data as { error?: string; suggested?: string };
        return rejectWithValue({
          message: typeof payload?.error === "string" ? payload.error : formatAxiosError(error),
          suggested: typeof payload?.suggested === "string" ? payload.suggested : undefined,
        });
      }
      return rejectWithValue({ message: formatAxiosError(error) });
    }
  },
);

export const fetchAdminCourse = createAsyncThunk(
  "admin/course",
  async (input: { id: number; editionId?: number }, { getState, rejectWithValue }) => {
    try {
      const { data } = await axios.get(`/api/admin/courses/${input.id}`, {
        headers: headers(getState),
        params: input.editionId ? { editionId: input.editionId } : undefined,
      });
      return data as {
        course: Course;
        editions: CourseEdition[];
        participants: Participant[];
        editionId: number | null;
        feedback: AdminState["feedback"];
      };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const saveCourse = createAsyncThunk(
  "admin/saveCourse",
  async (input: { id: number; body: Record<string, unknown> }, { getState, rejectWithValue }) => {
    try {
      await axios.patch(`/api/admin/courses/${input.id}`, input.body, { headers: headers(getState) });
      return true;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const uploadCourseCover = createAsyncThunk(
  "admin/uploadCourseCover",
  async (input: { id: number; file: File }, { getState, rejectWithValue }) => {
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.includes(",") ? result.split(",")[1] : result);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(input.file);
      });
      const { data } = await axios.post(
        `/api/admin/courses/${input.id}/cover-image`,
        {
          dataBase64,
          filename: input.file.name,
          mimeType: input.file.type || "image/jpeg",
        },
        { headers: headers(getState) },
      );
      return data.url as string;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const uploadCourseGalleryImage = createAsyncThunk(
  "admin/uploadCourseGalleryImage",
  async (input: { id: number; file: File; caption?: string }, { getState, rejectWithValue }) => {
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.includes(",") ? result.split(",")[1] : result);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(input.file);
      });
      const { data } = await axios.post(
        `/api/admin/courses/${input.id}/gallery`,
        {
          dataBase64,
          filename: input.file.name,
          mimeType: input.file.type || "image/jpeg",
          caption: input.caption,
        },
        { headers: headers(getState) },
      );
      return data.image as import("@shared/api").CourseGalleryImage;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const deleteCourseGalleryImage = createAsyncThunk(
  "admin/deleteCourseGalleryImage",
  async (input: { courseId: number; imageId: number }, { getState, rejectWithValue }) => {
    try {
      await axios.delete(`/api/admin/courses/${input.courseId}/gallery/${input.imageId}`, {
        headers: headers(getState),
      });
      return input.imageId;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const createEdition = createAsyncThunk(
  "admin/createEdition",
  async (input: { courseId: number; body: Record<string, unknown> }, { getState, rejectWithValue }) => {
    try {
      const { data } = await axios.post(`/api/admin/courses/${input.courseId}/editions`, input.body, {
        headers: headers(getState),
      });
      return data.id as number;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const saveEdition = createAsyncThunk(
  "admin/saveEdition",
  async (input: { id: number; body: Record<string, unknown> }, { getState, rejectWithValue }) => {
    try {
      await axios.patch(`/api/admin/editions/${input.id}`, input.body, { headers: headers(getState) });
      return true;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const saveEnrollment = createAsyncThunk(
  "admin/saveEnrollment",
  async (input: { id: number; body: Record<string, unknown> }, { getState, rejectWithValue }) => {
    try {
      await axios.patch(`/api/admin/enrollments/${input.id}`, input.body, { headers: headers(getState) });
      return true;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const fetchPayments = createAsyncThunk(
  "admin/payments",
  async (query: AdminListQuery | undefined, { getState, rejectWithValue }) => {
    try {
      const { data } = await axios.get("/api/admin/payments", {
        headers: headers(getState),
        params: listParams(query),
      });
      return data as { payments: PaymentRow[]; pagination: PaginationInfo };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const fetchParticipants = createAsyncThunk(
  "admin/participants",
  async (query: AdminListQuery | undefined, { getState, rejectWithValue }) => {
    try {
      const { data } = await axios.get("/api/admin/participants", {
        headers: headers(getState),
        params: listParams(query),
      });
      return data as { participants: AdminParticipantRow[]; pagination: PaginationInfo };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const fetchOpenEditions = createAsyncThunk("admin/openEditions", async (_, { getState, rejectWithValue }) => {
  try {
    const { data } = await axios.get("/api/admin/editions", { headers: headers(getState) });
    return data.editions as EditionOption[];
  } catch (error) {
    return rejectWithValue(formatAxiosError(error));
  }
});

export const addParticipant = createAsyncThunk(
  "admin/addParticipant",
  async (
    body: {
      email: string;
      firstName: string;
      lastName?: string;
      phone?: string;
      editionId: number;
      paymentMethod: "complimentary" | "transfer" | "company_invoice" | "card";
      sendConfirmationEmail?: boolean;
      amountCents?: number;
    },
    { getState, rejectWithValue },
  ) => {
    try {
      const { data } = await axios.post("/api/admin/participants", body, { headers: headers(getState) });
      return data as { enrollmentId: number; userId: number; newlyPaid: boolean };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const fetchTeam = createAsyncThunk(
  "admin/team",
  async (query: AdminListQuery | undefined, { getState, rejectWithValue }) => {
    try {
      const { data } = await axios.get("/api/admin/team", {
        headers: headers(getState),
        params: listParams(query),
      });
      return data as { team: AdminProfile[]; pagination: PaginationInfo };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const inviteStaff = createAsyncThunk(
  "admin/invite",
  async (
    body: { email: string; firstName: string; lastName: string; role: string; companyName?: string },
    { getState, rejectWithValue },
  ) => {
    try {
      const { data } = await axios.post("/api/admin/team", body, { headers: headers(getState) });
      return data.id as number;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const updateStaff = createAsyncThunk(
  "admin/updateStaff",
  async (input: { id: number; body: Record<string, unknown> }, { getState, rejectWithValue }) => {
    try {
      await axios.patch(`/api/admin/team/${input.id}`, input.body, { headers: headers(getState) });
      return true;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const fetchCatalogOptions = createAsyncThunk(
  "admin/fetchCatalogOptions",
  async (input: { kind: CatalogKind; includeInactive?: boolean }, { getState, rejectWithValue }) => {
    try {
      const { data } = await axios.get(`/api/admin/catalog/${input.kind}`, {
        headers: headers(getState),
        params: input.includeInactive ? { includeInactive: 1 } : undefined,
      });
      return { kind: input.kind, options: data.options as CatalogOption[] };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const fetchAllCatalogOptions = createAsyncThunk(
  "admin/fetchAllCatalogOptions",
  async (input: { includeInactive?: boolean } | undefined, { getState, rejectWithValue }) => {
    const kinds: CatalogKind[] = ["categories", "levels", "audiences", "cities", "venues"];
    try {
      const results = await Promise.all(
        kinds.map(async (kind) => {
          const { data } = await axios.get(`/api/admin/catalog/${kind}`, {
            headers: headers(getState),
            params: input?.includeInactive ? { includeInactive: 1 } : undefined,
          });
          return { kind, options: data.options as CatalogOption[] };
        }),
      );
      return results;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const createCatalogOption = createAsyncThunk(
  "admin/createCatalogOption",
  async (
    input: {
      kind: CatalogKind;
      label: string;
      slug?: string;
      sortOrder?: number;
      address?: string;
      cityId?: number;
    },
    { getState, rejectWithValue },
  ) => {
    try {
      const { data } = await axios.post(
        `/api/admin/catalog/${input.kind}`,
        {
          label: input.label,
          slug: input.slug,
          sortOrder: input.sortOrder,
          address: input.address,
          cityId: input.cityId,
        },
        { headers: headers(getState) },
      );
      return data.option as CatalogOption;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const updateCatalogOption = createAsyncThunk(
  "admin/updateCatalogOption",
  async (
    input: {
      kind: CatalogKind;
      id: number;
      body: {
        label?: string;
        slug?: string;
        sortOrder?: number;
        isActive?: boolean;
        address?: string;
        cityId?: number;
      };
    },
    { getState, rejectWithValue },
  ) => {
    try {
      const { data } = await axios.patch(`/api/admin/catalog/${input.kind}/${input.id}`, input.body, {
        headers: headers(getState),
      });
      return data.option as CatalogOption;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

const adminSlice = createSlice({
  name: "admin",
  initialState,
  reducers: {
    clearAdminDataError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdminDashboard.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAdminDashboard.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload.stats;
        state.upcoming = action.payload.upcoming;
      })
      .addCase(fetchAdminDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload || "");
      })
      .addCase(fetchAdminCourses.pending, (state) => {
        state.listLoading = true;
        state.error = null;
      })
      .addCase(fetchAdminCourses.fulfilled, (state, action) => {
        state.listLoading = false;
        state.courses = action.payload.courses;
        state.coursesPagination = action.payload.pagination;
      })
      .addCase(fetchAdminCourses.rejected, (state, action) => {
        state.listLoading = false;
        state.error = String(action.payload || "");
      })
      .addCase(fetchAdminCourse.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAdminCourse.fulfilled, (state, action) => {
        state.loading = false;
        state.course = action.payload.course;
        state.editions = action.payload.editions;
        state.participants = action.payload.participants;
        state.editionId = action.payload.editionId;
        state.feedback = action.payload.feedback;
      })
      .addCase(fetchAdminCourse.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload || "");
      })
      .addCase(saveCourse.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(saveCourse.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(saveCourse.rejected, (state, action) => {
        state.saving = false;
        state.error = String(action.payload || "");
      })
      .addCase(createCourse.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(createCourse.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(createCourse.rejected, (state, action) => {
        state.saving = false;
        const payload = action.payload as { message?: string } | string | undefined;
        state.error =
          typeof payload === "object" && payload?.message
            ? payload.message
            : typeof payload === "string"
              ? payload
              : "";
      })
      .addCase(uploadCourseGalleryImage.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(uploadCourseGalleryImage.fulfilled, (state, action) => {
        state.saving = false;
        if (state.course) {
          state.course.gallery = [...(state.course.gallery || []), action.payload];
        }
      })
      .addCase(uploadCourseGalleryImage.rejected, (state, action) => {
        state.saving = false;
        state.error = String(action.payload || "");
      })
      .addCase(deleteCourseGalleryImage.fulfilled, (state, action) => {
        if (state.course?.gallery) {
          state.course.gallery = state.course.gallery.filter((image) => image.id !== action.payload);
        }
      })
      .addCase(deleteCourseGalleryImage.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(createEdition.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(saveEdition.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(saveEnrollment.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(fetchPayments.pending, (state) => {
        state.listLoading = true;
        state.error = null;
      })
      .addCase(fetchPayments.fulfilled, (state, action) => {
        state.listLoading = false;
        state.payments = action.payload.payments;
        state.paymentsPagination = action.payload.pagination;
      })
      .addCase(fetchPayments.rejected, (state, action) => {
        state.listLoading = false;
        state.error = String(action.payload || "");
      })
      .addCase(fetchParticipants.pending, (state) => {
        state.listLoading = true;
        state.error = null;
      })
      .addCase(fetchParticipants.fulfilled, (state, action) => {
        state.listLoading = false;
        state.participantRows = action.payload.participants;
        state.participantsPagination = action.payload.pagination;
      })
      .addCase(fetchParticipants.rejected, (state, action) => {
        state.listLoading = false;
        state.error = String(action.payload || "");
      })
      .addCase(fetchOpenEditions.fulfilled, (state, action) => {
        state.openEditions = action.payload;
      })
      .addCase(addParticipant.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(addParticipant.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(addParticipant.rejected, (state, action) => {
        state.saving = false;
        state.error = String(action.payload || "");
      })
      .addCase(fetchTeam.pending, (state) => {
        state.listLoading = true;
        state.error = null;
      })
      .addCase(fetchTeam.fulfilled, (state, action) => {
        state.listLoading = false;
        state.team = action.payload.team;
        state.teamPagination = action.payload.pagination;
      })
      .addCase(fetchTeam.rejected, (state, action) => {
        state.listLoading = false;
        state.error = String(action.payload || "");
      })
      .addCase(inviteStaff.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(updateStaff.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(fetchCatalogOptions.fulfilled, (state, action) => {
        state.catalog[action.payload.kind] = action.payload.options;
      })
      .addCase(fetchCatalogOptions.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(fetchAllCatalogOptions.pending, (state) => {
        state.catalogLoading = true;
        state.error = null;
      })
      .addCase(fetchAllCatalogOptions.fulfilled, (state, action) => {
        state.catalogLoading = false;
        for (const entry of action.payload) {
          state.catalog[entry.kind] = entry.options;
        }
      })
      .addCase(fetchAllCatalogOptions.rejected, (state, action) => {
        state.catalogLoading = false;
        state.error = String(action.payload || "");
      })
      .addCase(createCatalogOption.fulfilled, (state, action) => {
        const option = action.payload;
        state.catalog[option.kind] = [...state.catalog[option.kind], option].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
        );
      })
      .addCase(createCatalogOption.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(updateCatalogOption.fulfilled, (state, action) => {
        const option = action.payload;
        state.catalog[option.kind] = state.catalog[option.kind]
          .map((row) => (row.id === option.id ? option : row))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
      })
      .addCase(updateCatalogOption.rejected, (state, action) => {
        state.error = String(action.payload || "");
      });
  },
});

export const { clearAdminDataError } = adminSlice.actions;
export default adminSlice.reducer;
