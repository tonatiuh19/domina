import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import type { Course } from "@shared/api";
import { formatAxiosError } from "@/lib/api";

interface CatalogState {
  courses: Course[];
  course: Course | null;
  loading: boolean;
  error: string | null;
}

const initialState: CatalogState = {
  courses: [],
  course: null,
  loading: false,
  error: null,
};

export const fetchCatalog = createAsyncThunk("catalog/list", async (_, { rejectWithValue }) => {
  try {
    const { data } = await axios.get("/api/catalog/courses");
    return data.courses as Course[];
  } catch (error) {
    return rejectWithValue(formatAxiosError(error));
  }
});

export const fetchCourse = createAsyncThunk("catalog/one", async (slug: string, { rejectWithValue }) => {
  try {
    const { data } = await axios.get(`/api/catalog/courses/${slug}`);
    return data.course as Course;
  } catch (error) {
    return rejectWithValue(formatAxiosError(error));
  }
});

const catalogSlice = createSlice({
  name: "catalog",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCatalog.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCatalog.fulfilled, (state, action) => {
        state.loading = false;
        state.courses = action.payload;
      })
      .addCase(fetchCatalog.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload || "");
      })
      .addCase(fetchCourse.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.course = null;
      })
      .addCase(fetchCourse.fulfilled, (state, action) => {
        state.loading = false;
        state.course = action.payload;
      })
      .addCase(fetchCourse.rejected, (state, action) => {
        state.loading = false;
        state.course = null;
        state.error = String(action.payload || "");
      });
  },
});

export default catalogSlice.reducer;
