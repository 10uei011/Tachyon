#include <cassert>
#include <stdint.h>

typedef intptr_t pint;
typedef intptr_t box;
typedef int8_t* ref;
typedef int8_t* rptr;

ref unboxRef(box boxVal)
{
	return (ref)(boxVal & ~7);
}

box boxRef(ref refVal, pint tagVal)
{
	return (box)((pint)refVal | tagVal);
}

pint getRefTag(box boxVal)
{
	return (boxVal & 7);
}

//
// hashtbl
//

pint get_hashtbl_size(box obj)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	return *((pint*)(ptr + offset));
}

void set_hashtbl_size(box obj, pint val)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	*((pint*)(ptr + offset)) = val;
}

box get_hashtbl_tbl_key(box obj, pint idx0)
{
	pint offset = 0;
	offset += 8;
	offset += 8 * idx0;
	offset += 0;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_hashtbl_tbl_key(box obj, pint idx0, box val)
{
	pint offset = 0;
	offset += 8;
	offset += 8 * idx0;
	offset += 0;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

box get_hashtbl_tbl_val(box obj, pint idx0)
{
	pint offset = 0;
	offset += 8;
	offset += 8 * idx0;
	offset += 4;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_hashtbl_tbl_val(box obj, pint idx0, box val)
{
	pint offset = 0;
	offset += 8;
	offset += 8 * idx0;
	offset += 4;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

pint comp_size_hashtbl(pint size)
{
	pint baseSize = 8;
	pint elemSize = 8;
	pint objSize = baseSize + elemSize * size;
	return objSize;
}

pint sizeof_hashtbl(box obj)
{
	pint size = get_hashtbl_size(obj);
	return comp_size_hashtbl(size);
}

void visit_hashtbl(box obj)
{
}

//
// obj
//

box get_obj_proto(box obj)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_obj_proto(box obj, box val)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

box get_obj_tbl(box obj)
{
	pint offset = 0;
	offset += 8;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_obj_tbl(box obj, box val)
{
	pint offset = 0;
	offset += 8;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

pint comp_size_obj()
{
	pint baseSize = 12;
	pint elemSize = 4;
	pint size = 1;
	pint objSize = baseSize + elemSize * size;
	return objSize;
}

pint sizeof_obj(box obj)
{
	return comp_size_obj();
}

void visit_obj(box obj)
{
}

//
// arrtbl
//

pint get_arrtbl_size(box obj)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	return *((pint*)(ptr + offset));
}

void set_arrtbl_size(box obj, pint val)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	*((pint*)(ptr + offset)) = val;
}

box get_arrtbl_tbl(box obj, pint idx0)
{
	pint offset = 0;
	offset += 8;
	offset += 4 * idx0;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_arrtbl_tbl(box obj, pint idx0, box val)
{
	pint offset = 0;
	offset += 8;
	offset += 4 * idx0;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

pint comp_size_arrtbl(pint size)
{
	pint baseSize = 8;
	pint elemSize = 4;
	pint objSize = baseSize + elemSize * size;
	return objSize;
}

pint sizeof_arrtbl(box obj)
{
	pint size = get_arrtbl_size(obj);
	return comp_size_arrtbl(size);
}

void visit_arrtbl(box obj)
{
}

//
// arr
//

box get_arr_proto(box obj)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_arr_proto(box obj, box val)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

box get_arr_tbl(box obj)
{
	pint offset = 0;
	offset += 8;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_arr_tbl(box obj, box val)
{
	pint offset = 0;
	offset += 8;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

box get_arr_arr(box obj)
{
	pint offset = 0;
	offset += 16;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_arr_arr(box obj, box val)
{
	pint offset = 0;
	offset += 16;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

pint comp_size_arr()
{
	pint baseSize = 20;
	pint elemSize = 4;
	pint size = 1;
	pint objSize = baseSize + elemSize * size;
	return objSize;
}

pint sizeof_arr(box obj)
{
	return comp_size_arr();
}

void visit_arr(box obj)
{
}

//
// str
//

pint get_str_size(box obj)
{
	pint offset = 0;
	offset += 8;
	ref ptr = unboxRef(obj);
	return *((pint*)(ptr + offset));
}

void set_str_size(box obj, pint val)
{
	pint offset = 0;
	offset += 8;
	ref ptr = unboxRef(obj);
	*((pint*)(ptr + offset)) = val;
}

pint comp_size_str(pint size)
{
	pint baseSize = 12;
	pint elemSize = 2;
	pint objSize = baseSize + elemSize * size;
	return objSize;
}

pint sizeof_str(box obj)
{
	pint size = get_str_size(obj);
	return comp_size_str(size);
}

void visit_str(box obj)
{
}

//
// strtbl
//

pint get_strtbl_size(box obj)
{
	pint offset = 0;
	offset += 8;
	ref ptr = unboxRef(obj);
	return *((pint*)(ptr + offset));
}

void set_strtbl_size(box obj, pint val)
{
	pint offset = 0;
	offset += 8;
	ref ptr = unboxRef(obj);
	*((pint*)(ptr + offset)) = val;
}

box get_strtbl_tbl(box obj, pint idx0)
{
	pint offset = 0;
	offset += 12;
	offset += 4 * idx0;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_strtbl_tbl(box obj, pint idx0, box val)
{
	pint offset = 0;
	offset += 12;
	offset += 4 * idx0;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

pint comp_size_strtbl(pint size)
{
	pint baseSize = 12;
	pint elemSize = 4;
	pint objSize = baseSize + elemSize * size;
	return objSize;
}

pint sizeof_strtbl(box obj)
{
	pint size = get_strtbl_size(obj);
	return comp_size_strtbl(size);
}

void visit_strtbl(box obj)
{
}

//
// clos
//

box get_clos_proto(box obj)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_clos_proto(box obj, box val)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

box get_clos_tbl(box obj)
{
	pint offset = 0;
	offset += 8;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_clos_tbl(box obj, box val)
{
	pint offset = 0;
	offset += 8;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

rptr get_clos_funcptr(box obj)
{
	pint offset = 0;
	offset += 16;
	ref ptr = unboxRef(obj);
	return *((rptr*)(ptr + offset));
}

void set_clos_funcptr(box obj, rptr val)
{
	pint offset = 0;
	offset += 16;
	ref ptr = unboxRef(obj);
	*((rptr*)(ptr + offset)) = val;
}

pint get_clos_size(box obj)
{
	pint offset = 0;
	offset += 20;
	ref ptr = unboxRef(obj);
	return *((pint*)(ptr + offset));
}

void set_clos_size(box obj, pint val)
{
	pint offset = 0;
	offset += 20;
	ref ptr = unboxRef(obj);
	*((pint*)(ptr + offset)) = val;
}

box get_clos_cells(box obj, pint idx0)
{
	pint offset = 0;
	offset += 24;
	offset += 4 * idx0;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_clos_cells(box obj, pint idx0, box val)
{
	pint offset = 0;
	offset += 24;
	offset += 4 * idx0;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

pint comp_size_clos(pint size)
{
	pint baseSize = 24;
	pint elemSize = 4;
	pint objSize = baseSize + elemSize * size;
	return objSize;
}

pint sizeof_clos(box obj)
{
	pint size = get_clos_size(obj);
	return comp_size_clos(size);
}

void visit_clos(box obj)
{
}

//
// cell
//

box get_cell_val(box obj)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	return *((box*)(ptr + offset));
}

void set_cell_val(box obj, box val)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	*((box*)(ptr + offset)) = val;
}

pint comp_size_cell()
{
	pint baseSize = 4;
	pint elemSize = 4;
	pint size = 1;
	pint objSize = baseSize + elemSize * size;
	return objSize;
}

pint sizeof_cell(box obj)
{
	return comp_size_cell();
}

void visit_cell(box obj)
{
}

//
// memblock
//

rptr get_memblock_ptr(box obj)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	return *((rptr*)(ptr + offset));
}

void set_memblock_ptr(box obj, rptr val)
{
	pint offset = 0;
	offset += 4;
	ref ptr = unboxRef(obj);
	*((rptr*)(ptr + offset)) = val;
}

pint comp_size_memblock()
{
	pint baseSize = 8;
	pint elemSize = 4;
	pint size = 1;
	pint objSize = baseSize + elemSize * size;
	return objSize;
}

pint sizeof_memblock(box obj)
{
	return comp_size_memblock();
}

void visit_memblock(box obj)
{
}

