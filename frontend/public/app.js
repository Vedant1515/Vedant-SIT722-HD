(function(){
  const e = React.createElement;
  const root = ReactDOM.createRoot(document.getElementById('root'));
  const qInput = document.getElementById('q');

  function App(){
    const [q, setQ] = React.useState('technology');
    const [loading, setLoading] = React.useState(false);
    const [items, setItems] = React.useState([]);

    async function fetchNews(topic){
      setLoading(true);
      try{
        const base = window.location.origin; // frontend served by nginx
        const url = base + '/api/news?q=' + encodeURIComponent(topic);
        const res = await fetch(url);
        const data = await res.json();
        setItems(Array.isArray(data.articles) ? data.articles : []);
      } catch(err){
        console.error(err);
        setItems([]);
      } finally{
        setLoading(false);
      }
    }

    React.useEffect(()=>{ fetchNews(q); }, []);

    React.useEffect(()=>{
      const handler = e => {
        if(e.key === 'Enter'){
          setQ(qInput.value);
          fetchNews(qInput.value);
        }
      };
      qInput.addEventListener('keypress', handler);
      return () => qInput.removeEventListener('keypress', handler);
    }, []);

    return e(React.Fragment, null,
      loading ? e('div',{className:'muted'},'Loading...') : null,
      items.map((a, idx)=> e('div',{className:'card',key:idx},
        e('h3', null, a.title || 'Untitled'),
        e('p', null, a.description || 'No description'),
        a.url ? e('a', {href:a.url, target:'_blank', rel:'noreferrer'}, 'Read more →') : null,
        e('div',{className:'muted'}, (a.source && a.source.name) ? a.source.name : '')
      ))
    );
  }

  root.render(e(App));
})();
