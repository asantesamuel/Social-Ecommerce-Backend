import {
  Controller, Route, Tags, Get, Post, Put, Delete,
  Path, Body, Security, Request, SuccessResponse, Response,
} from 'tsoa';
import { Request as ExpressRequest } from 'express';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryResponseDto,
} from './categories.dto';

@Route('categories')
@Tags('Categories')
export class CategoriesController extends Controller {
  private service = new CategoriesService();

  /** Get all categories */
  @Get()
  async getAll(): Promise<CategoryResponseDto[]> {
    return this.service.findAll();
  }

  /** Get a single category by ID */
  @Get('{id}')
  @Response(404, 'Category not found')
  async getOne(@Path() id: string): Promise<CategoryResponseDto> {
    return this.service.findOne(id);
  }

  /** Create a new category - admin only */
  @Post()
  @Security('jwt')
  @SuccessResponse(201, 'Created')
  @Response(409, 'Slug already exists')
  async create(
    @Request() req: ExpressRequest,
    @Body() body: CreateCategoryDto
  ): Promise<CategoryResponseDto> {
    this.setStatus(201);
    return this.service.create(body, req.user!);
  }

  /** Update a category - admin only */
  @Put('{id}')
  @Security('jwt')
  @Response(404, 'Category not found')
  async update(
    @Path() id: string,
    @Request() req: ExpressRequest,
    @Body() body: UpdateCategoryDto
  ): Promise<CategoryResponseDto> {
    return this.service.update(id, body, req.user!);
  }

  /** Delete a category - admin only */
  @Delete('{id}')
  @Security('jwt')
  @SuccessResponse(204, 'Deleted')
  @Response(404, 'Category not found')
  async remove(
    @Path() id: string,
    @Request() req: ExpressRequest
  ): Promise<void> {
    await this.service.remove(id, req.user!);
    this.setStatus(204);
  }
}
