import streamlit as st
import streamlit.components.v1 as components
from backend import SemanticMemory
import os

st.set_page_config(page_title="Semantic File Memory", layout="wide")

@st.cache_resource
def load_system():
    # SET YOUR FOLDER
    target_folder = "./test_documents" 
    if not os.path.exists(target_folder):
        os.makedirs(target_folder)
    return SemanticMemory(target_folder)

st.title("Semantic File Memory and Knowledge Graph Based Personal Knowledge Engine")

# Sidebar
with st.sidebar:
    st.header("System Status")
    system = load_system()
    st.success(f"Indexed {len(system.documents)} files")
    
    if st.button("Reload Index"):
        st.cache_resource.clear()
        st.rerun()

# Main Search
query = st.text_input("Search files...", placeholder="e.g. 'latest resume' or 'project specs'")

col1, col2 = st.columns([1, 1])

if query:
    with st.spinner("Searching..."):
        results = system.hybrid_search(query)
    
    with col1:
        st.subheader(f"Found {len(results)} matches")
        if not results:
            st.warning("No files matched the criteria.")
        
        for r in results:
            with st.container():
                st.markdown(f"### 📄 {r['filename']}")
                st.caption(f"Path: {r['path']} | Modified: {r['mod_time']}")
                st.markdown(f"_{r['snippet']}_")
                
                # Debug Score Visualizer
                with st.expander(f"⭐ Relevance Score: {r['score']}"):
                    st.json(r['breakdown'])
                st.divider()

    with col2:
        st.subheader("Knowledge Graph")
        try:
            html_data = system.get_graph_html()
            components.html(html_data, height=800, scrolling=True)
        except Exception as e:
            st.error(str(e))
else:
    with col1:
        st.info("Enter a query to start.")
    with col2:
        components.html(system.get_graph_html(), height=800)